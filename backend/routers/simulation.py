"""
Simulation router — create simulations, stream progress, proxy to MiroFish.
Simplified from strategy_sim: no project/scenario hierarchy. Flat simulation model.
"""

import asyncio
import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

import database as db
from services.llm_service import complete as llm_complete
from services.mirofish_proxy import (
    mf_get, mf_post, mf_post_multipart, mf_delete,
    ENGLISH_INSTRUCTION,
)
from services.history_fusion import (
    validate_history_file,
    build_history_seed_text,
    build_predictive_history_requirement,
    actors_from_history,
)

router = APIRouter(tags=["simulation"])


class SimulationCreate(BaseModel):
    name: str = "Untitled Simulation"
    history_file: dict
    rounds: int = 40
    use_nash: bool = False
    nash_result: Optional[dict] = None


# ========================
# Simulation CRUD
# ========================

@router.post("/api/simulations")
async def create_simulation(body: SimulationCreate):
    """
    Create a simulation from a history file:
    1. Validate history file
    2. Run optional Nash analysis
    3. Build seed text from history
    4. Create MiroFish project + simulation pipeline
    """
    # Validate history file
    validation = validate_history_file(body.history_file)
    if not validation["valid"]:
        return {
            "success": False,
            "error": "History file validation failed",
            "data": {"errors": validation["errors"]},
        }

    sim_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Run Nash analysis if requested
    nash_result_json = ""
    if body.nash_result:
        nash_result_json = json.dumps(body.nash_result)
    elif body.use_nash:
        try:
            from services.nash_engine import analyse_seed
            actors = actors_from_history(body.history_file)
            nash_result = await analyse_seed({"actors": actors, "title": body.history_file.get("title", "")})
            nash_result_json = json.dumps(nash_result)
        except Exception as e:
            nash_result_json = json.dumps({"error": f"Nash analysis failed: {str(e)}"})

    # Store initial state vectors as baseline
    initial_vectors = body.history_file.get("initialStateVectors", {})

    await db.execute(
        """
        INSERT INTO simulations
            (id, name, status, history_file, config, nash_result,
             state_vectors, baseline_vectors, total_rounds, created_at)
        VALUES (?, ?, 'creating', ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            sim_id, body.name,
            json.dumps(body.history_file),
            json.dumps({"rounds": body.rounds, "use_nash": body.use_nash}),
            nash_result_json,
            json.dumps(initial_vectors),
            json.dumps(initial_vectors),
            body.rounds,
            now,
        ),
    )

    # Build seed text from history file
    seed_text = build_history_seed_text(body.history_file)

    # Build predictive history requirement
    ph_prompt_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "prompts", "predictive_history.txt",
    )
    full_requirement = ENGLISH_INSTRUCTION
    try:
        with open(ph_prompt_path, "r") as f:
            ph_template = f.read()
        ph_requirement = build_predictive_history_requirement(body.history_file, ph_template)
        full_requirement = f"{ph_requirement}\n\n{ENGLISH_INSTRUCTION}"
    except FileNotFoundError:
        full_requirement = f"{ENGLISH_INSTRUCTION}\n\n{body.history_file.get('description', '')}"

    # Step 1: Create MiroFish project via ontology/generate
    mf_project_result = {"success": False, "error": "No seed content"}
    if seed_text:
        tmp_path = os.path.join(tempfile.gettempdir(), f"seed_{sim_id}.md")
        with open(tmp_path, "w") as f:
            f.write(seed_text)

        with open(tmp_path, "rb") as f:
            mf_project_result = await mf_post_multipart(
                "/graph/ontology/generate",
                fields={
                    "simulation_requirement": full_requirement,
                    "project_name": body.name,
                    "additional_context": (
                        f"{ENGLISH_INSTRUCTION}\n\n"
                        "All agent profiles, social media posts, analysis, and reports must be in English."
                    ),
                },
                files={"files": ("seed.md", f, "text/markdown")},
            )

        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    if not mf_project_result.get("success"):
        await db.execute(
            "UPDATE simulations SET status = 'failed', summary = ? WHERE id = ?",
            (json.dumps(mf_project_result), sim_id),
        )
        return {
            "success": False,
            "data": {"id": sim_id},
            "error": mf_project_result.get("error", "Failed to create MiroFish project"),
        }

    mf_project_id = mf_project_result.get("data", {}).get("project_id", "")

    # Store MiroFish project ID in config
    config = {"rounds": body.rounds, "use_nash": body.use_nash, "mirofish_project_id": mf_project_id}
    await db.execute(
        "UPDATE simulations SET config = ? WHERE id = ?",
        (json.dumps(config), sim_id),
    )

    # Step 2: Build graph, create sim, prepare, start
    mf_simulation_id = await _build_graph_and_create_sim(
        mf_project_id, full_requirement, body.rounds, sim_id=sim_id,
    )

    final_status = "running" if mf_simulation_id else "failed"
    config["mirofish_simulation_id"] = mf_simulation_id or ""
    await db.execute(
        "UPDATE simulations SET status = ?, config = ? WHERE id = ?",
        (final_status, json.dumps(config), sim_id),
    )

    sim = await db.fetchone("SELECT * FROM simulations WHERE id = ?", (sim_id,))

    if not mf_simulation_id:
        return {
            "success": False,
            "data": sim,
            "error": "Graph build or simulation creation failed. Use Retry to try again.",
        }

    return {"success": True, "data": sim}


async def _build_graph_and_create_sim(
    mf_project_id: str, requirement: str, num_rounds: int,
    max_retries: int = 3, sim_id: str = "",
) -> str:
    """
    Full MiroFish pipeline: build graph -> create sim -> prepare -> start.
    Returns simulation_id or empty string on failure.
    """
    project_status = await mf_get(f"/graph/project/{mf_project_id}")
    proj_data = project_status.get("data", {})
    current_status = proj_data.get("status", "")
    graph_id = proj_data.get("graph_id")

    if not graph_id and current_status in ("ontology_generated", "created"):
        if sim_id:
            await db.execute(
                "UPDATE simulations SET status = 'building_graph', summary = ? WHERE id = ?",
                ('{"phase": "graph_build", "message": "Starting knowledge graph construction..."}', sim_id),
            )

        build_result = await mf_post("/graph/build", {"project_id": mf_project_id})
        if not build_result.get("success"):
            return ""

        task_id = build_result.get("data", {}).get("task_id", "")
        if task_id:
            for poll_i in range(180):
                await asyncio.sleep(5)
                task_status = await mf_get(f"/graph/task/{task_id}")
                task_data = task_status.get("data", {})
                status = task_data.get("status", "")

                if sim_id:
                    progress = task_data.get("progress", 0)
                    message = task_data.get("message", f"Building graph... ({status})")
                    await db.execute(
                        "UPDATE simulations SET summary = ? WHERE id = ?",
                        (json.dumps({
                            "phase": "graph_build",
                            "progress": progress,
                            "message": message,
                            "elapsed_seconds": (poll_i + 1) * 5,
                        }), sim_id),
                    )

                if status in ("completed", "done", "success"):
                    break
                if status in ("failed", "error"):
                    if sim_id:
                        err = task_data.get("error", "Graph build failed")
                        await db.execute(
                            "UPDATE simulations SET summary = ? WHERE id = ?",
                            (json.dumps({"phase": "graph_build", "error": err}), sim_id),
                        )
                    return ""
            else:
                return ""

    # Create simulation
    if sim_id:
        await db.execute(
            "UPDATE simulations SET status = 'creating_sim', summary = ? WHERE id = ?",
            (json.dumps({"phase": "sim_create", "message": "Creating simulation environment..."}), sim_id),
        )

    mf_sim_id = ""
    for attempt in range(max_retries):
        mf_sim_result = await mf_post(
            "/simulation/create",
            {
                "project_id": mf_project_id,
                "simulation_requirement": requirement,
                "num_rounds": num_rounds,
            },
        )
        if mf_sim_result.get("success"):
            mf_sim_id = mf_sim_result.get("data", {}).get("simulation_id", "")
            if mf_sim_id:
                break

        if attempt < max_retries - 1:
            await asyncio.sleep(3)

    if not mf_sim_id:
        return ""

    # Prepare simulation
    if sim_id:
        await db.execute(
            "UPDATE simulations SET status = 'preparing', summary = ? WHERE id = ?",
            (json.dumps({"phase": "prepare", "message": "Generating agent profiles..."}), sim_id),
        )

    prepare_result = await mf_post(
        "/simulation/prepare",
        {
            "simulation_id": mf_sim_id,
            "project_id": mf_project_id,
            "num_rounds": num_rounds,
            "simulation_requirement": requirement,
        },
    )

    if not prepare_result.get("success"):
        await asyncio.sleep(3)
        await mf_post(
            "/simulation/prepare",
            {
                "simulation_id": mf_sim_id,
                "project_id": mf_project_id,
                "num_rounds": num_rounds,
                "simulation_requirement": requirement,
            },
        )

    # Poll for preparation
    for prep_i in range(180):
        await asyncio.sleep(5)
        prep_status = await mf_post(
            "/simulation/prepare/status",
            {"simulation_id": mf_sim_id},
        )
        prep_data = prep_status.get("data", {})
        status = prep_data.get("status", "")

        if sim_id:
            await db.execute(
                "UPDATE simulations SET summary = ? WHERE id = ?",
                (json.dumps({
                    "phase": "prepare",
                    "message": f"Generating agent profiles... ({status or 'working'})",
                    "elapsed_seconds": (prep_i + 1) * 5,
                }), sim_id),
            )

        if not status or status in ("unknown",):
            sim_check = await mf_get(f"/simulation/{mf_sim_id}")
            sim_data = sim_check.get("data", {})
            status = sim_data.get("status", "")
            if sim_data.get("config_generated") and sim_data.get("profiles_count", 0) > 0:
                status = "ready"

        if status in ("ready", "prepared", "completed"):
            break
        if status in ("failed", "error"):
            return mf_sim_id
    else:
        return mf_sim_id

    # Start simulation
    if sim_id:
        await db.execute(
            "UPDATE simulations SET status = 'running' WHERE id = ?", (sim_id,)
        )

    start_result = await mf_post(
        "/simulation/start",
        {"simulation_id": mf_sim_id},
    )

    if not start_result.get("success"):
        await asyncio.sleep(3)
        await mf_post("/simulation/start", {"simulation_id": mf_sim_id})

    return mf_sim_id


@router.get("/api/simulations")
async def list_simulations():
    """List all simulations."""
    sims = await db.fetchall("SELECT * FROM simulations ORDER BY created_at DESC")
    return {"success": True, "data": sims}


@router.get("/api/simulations/{sim_id}")
async def get_simulation(sim_id: str):
    """Get a simulation's status and details."""
    sim = await db.fetchone("SELECT * FROM simulations WHERE id = ?", (sim_id,))
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    # If simulation has a MiroFish sim, fetch live status
    config = {}
    try:
        config = json.loads(sim.get("config", "{}") or "{}")
    except (json.JSONDecodeError, TypeError):
        pass

    mf_sim_id = config.get("mirofish_simulation_id", "")
    if mf_sim_id and sim.get("status") not in ("completed", "failed"):
        live_status = await mf_get(f"/simulation/{mf_sim_id}/run-status")
        if live_status.get("success"):
            live_data = live_status.get("data", {})
            sim["mirofish_status"] = live_data
            runner_status = live_data.get("runner_status", "")

            if runner_status in ("completed", "stopped", "error", "failed"):
                final_status = "completed" if runner_status == "completed" else "failed"
                completed_at = datetime.now(timezone.utc).isoformat()
                await db.execute(
                    "UPDATE simulations SET status = ?, completed_at = ? WHERE id = ?",
                    (final_status, completed_at, sim_id),
                )
                sim["status"] = final_status
                sim["completed_at"] = completed_at

    return {"success": True, "data": sim}


@router.delete("/api/simulations/{sim_id}")
async def delete_simulation(sim_id: str):
    """Delete a simulation."""
    sim = await db.fetchone("SELECT * FROM simulations WHERE id = ?", (sim_id,))
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    await db.execute("DELETE FROM simulations WHERE id = ?", (sim_id,))
    return {"success": True, "data": {"deleted": sim_id}}


@router.post("/api/simulations/{sim_id}/retry")
async def retry_simulation(sim_id: str):
    """Retry a stuck/failed simulation."""
    sim = await db.fetchone("SELECT * FROM simulations WHERE id = ?", (sim_id,))
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    config = {}
    try:
        config = json.loads(sim.get("config", "{}") or "{}")
    except (json.JSONDecodeError, TypeError):
        pass

    mf_project_id = config.get("mirofish_project_id", "")
    if not mf_project_id:
        raise HTTPException(status_code=400, detail="No MiroFish project associated")

    history_file = {}
    try:
        history_file = json.loads(sim.get("history_file", "{}") or "{}")
    except (json.JSONDecodeError, TypeError):
        pass

    num_rounds = config.get("rounds", 40)

    ph_prompt_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "prompts", "predictive_history.txt",
    )
    full_requirement = ENGLISH_INSTRUCTION
    try:
        with open(ph_prompt_path, "r") as f:
            ph_template = f.read()
        ph_requirement = build_predictive_history_requirement(history_file, ph_template)
        full_requirement = f"{ph_requirement}\n\n{ENGLISH_INSTRUCTION}"
    except FileNotFoundError:
        pass

    await db.execute(
        "UPDATE simulations SET status = 'creating' WHERE id = ?", (sim_id,)
    )

    mf_simulation_id = await _build_graph_and_create_sim(
        mf_project_id, full_requirement, num_rounds, sim_id=sim_id,
    )

    final_status = "running" if mf_simulation_id else "failed"
    config["mirofish_simulation_id"] = mf_simulation_id or ""
    await db.execute(
        "UPDATE simulations SET status = ?, config = ? WHERE id = ?",
        (final_status, json.dumps(config), sim_id),
    )

    updated = await db.fetchone("SELECT * FROM simulations WHERE id = ?", (sim_id,))
    if not mf_simulation_id:
        return {"success": False, "data": updated, "error": "Retry failed"}

    return {"success": True, "data": updated}


# ========================
# SSE Progress Streaming
# ========================

@router.get("/api/simulations/{sim_id}/stream")
async def stream_progress(sim_id: str, request: Request):
    """SSE endpoint for real-time simulation progress."""
    sim = await db.fetchone("SELECT * FROM simulations WHERE id = ?", (sim_id,))
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    config = {}
    try:
        config = json.loads(sim.get("config", "{}") or "{}")
    except (json.JSONDecodeError, TypeError):
        pass

    mf_sim_id = config.get("mirofish_simulation_id", "")

    async def event_generator():
        last_round = -1
        stale_count = 0
        current_mf_sim_id = mf_sim_id

        # Phase 1: Poll DB for creation-phase progress
        while not current_mf_sim_id:
            if await request.is_disconnected():
                return

            fresh = await db.fetchone("SELECT * FROM simulations WHERE id = ?", (sim_id,))
            if not fresh:
                return

            try:
                fresh_config = json.loads(fresh.get("config", "{}") or "{}")
            except (json.JSONDecodeError, TypeError):
                fresh_config = {}

            current_mf_sim_id = fresh_config.get("mirofish_simulation_id", "")
            run_status = fresh.get("status", "")

            pipeline_info = {}
            try:
                pipeline_info = json.loads(fresh.get("summary", "{}") or "{}")
            except (json.JSONDecodeError, TypeError):
                pass

            phase = pipeline_info.get("phase", run_status)
            message = pipeline_info.get("message", f"Status: {run_status}")
            progress = pipeline_info.get("progress", 0)
            elapsed = pipeline_info.get("elapsed_seconds", 0)

            yield {
                "event": "progress",
                "data": json.dumps({
                    "sim_id": sim_id,
                    "current_round": 0,
                    "total_rounds": 0,
                    "status": run_status,
                    "pipeline_phase": phase,
                    "pipeline_message": message,
                    "pipeline_progress": progress,
                    "elapsed_seconds": elapsed,
                    "action_count": 0,
                    "agent_count": 0,
                }),
            }

            if run_status in ("failed",):
                yield {
                    "event": "error",
                    "data": json.dumps({"message": pipeline_info.get("error", "Pipeline failed")}),
                }
                return

            if current_mf_sim_id:
                break

            await asyncio.sleep(3)

        # Phase 2: Poll MiroFish for simulation progress
        while True:
            if await request.is_disconnected():
                break

            status = await mf_get(f"/simulation/{current_mf_sim_id}/run-status")

            if status.get("success"):
                data = status.get("data", {})
                current_round = data.get("current_round", 0)
                total_rounds = data.get("total_rounds", 0)
                sim_status = data.get("runner_status", data.get("status", "unknown"))

                yield {
                    "event": "progress",
                    "data": json.dumps({
                        "sim_id": sim_id,
                        "current_round": current_round,
                        "total_rounds": total_rounds,
                        "status": sim_status,
                        "action_count": data.get("total_actions_count", data.get("action_count", 0)),
                        "agent_count": data.get("agent_count", 0),
                    }),
                }

                if sim_status in ("completed", "stopped", "error", "failed"):
                    final_status = "completed" if sim_status == "completed" else "failed"
                    completed_at = datetime.now(timezone.utc).isoformat()
                    await db.execute(
                        "UPDATE simulations SET status = ?, completed_at = ? WHERE id = ?",
                        (final_status, completed_at, sim_id),
                    )

                    yield {
                        "event": "complete",
                        "data": json.dumps({
                            "sim_id": sim_id,
                            "status": final_status,
                        }),
                    }
                    break

                if current_round == last_round:
                    stale_count += 1
                else:
                    stale_count = 0
                    last_round = current_round

                if stale_count > 60:
                    yield {
                        "event": "stale",
                        "data": json.dumps({
                            "message": "No progress for 5 minutes",
                            "sim_id": sim_id,
                        }),
                    }
            else:
                yield {
                    "event": "error",
                    "data": json.dumps({
                        "message": status.get("error", "Failed to fetch status"),
                    }),
                }

            await asyncio.sleep(5)

    return EventSourceResponse(event_generator())


# ========================
# MiroFish Proxy Endpoints
# ========================

@router.get("/api/mirofish/simulation/{simulation_id}/status")
async def proxy_simulation_status(simulation_id: str):
    """Get simulation state from MiroFish."""
    return await mf_get(f"/simulation/{simulation_id}")


@router.get("/api/mirofish/simulation/{simulation_id}/run-status")
async def proxy_run_status(simulation_id: str):
    """Get real-time run status from MiroFish."""
    return await mf_get(f"/simulation/{simulation_id}/run-status")


@router.get("/api/mirofish/simulation/{simulation_id}/actions")
async def proxy_actions(simulation_id: str, limit: int = 10000, platform: Optional[str] = None, round_num: Optional[int] = None):
    """Get simulation actions from MiroFish."""
    params: dict = {"limit": limit}
    if platform and platform != "all":
        params["platform"] = platform
    if round_num is not None:
        params["round_num"] = round_num
    return await mf_get(f"/simulation/{simulation_id}/actions", params)


@router.get("/api/mirofish/simulation/{simulation_id}/timeline")
async def proxy_timeline(simulation_id: str):
    return await mf_get(f"/simulation/{simulation_id}/timeline")


@router.get("/api/mirofish/simulation/{simulation_id}/agent-stats")
async def proxy_agent_stats(simulation_id: str):
    return await mf_get(f"/simulation/{simulation_id}/agent-stats")


@router.get("/api/mirofish/simulation/{simulation_id}/profiles")
async def proxy_profiles(simulation_id: str):
    return await mf_get(f"/simulation/{simulation_id}/profiles")


@router.get("/api/mirofish/simulation/{simulation_id}/posts")
async def proxy_posts(simulation_id: str, request: Request):
    params = dict(request.query_params)
    return await mf_get(f"/simulation/{simulation_id}/posts", params)


class SimulationAction(BaseModel):
    simulation_id: str
    project_id: Optional[str] = None
    num_rounds: Optional[int] = None
    simulation_requirement: Optional[str] = None


@router.post("/api/mirofish/simulation/stop")
async def proxy_stop(body: SimulationAction):
    return await mf_post("/simulation/stop", body.model_dump(exclude_none=True))


# ========================
# Report Proxy
# ========================

class ReportGenerate(BaseModel):
    simulation_id: str
    report_type: str = "full"
    additional_instructions: str = ""


@router.post("/api/report/generate")
async def proxy_report_generate(body: ReportGenerate):
    """Generate a report."""
    data = body.model_dump()
    if not data.get("additional_instructions"):
        data["additional_instructions"] = ENGLISH_INSTRUCTION
    else:
        data["additional_instructions"] = ENGLISH_INSTRUCTION + "\n" + data["additional_instructions"]
    return await mf_post("/report/generate", data)


@router.get("/api/report/by-simulation/{simulation_id}")
async def proxy_report_by_simulation(simulation_id: str):
    return await mf_get(f"/report/by-simulation/{simulation_id}")


@router.get("/api/report/content/{report_id}")
async def proxy_report_content(report_id: str):
    result = await mf_get(f"/report/{report_id}")
    if result.get("success") and result.get("data"):
        data = result["data"]
        if "markdown_content" in data and not data.get("content"):
            data["content"] = data["markdown_content"]
        if not data.get("title"):
            data["title"] = "MiroJiang Analysis Report"
    return result


@router.get("/api/report/status/{report_id}")
async def proxy_report_status(report_id: str):
    return await mf_get(f"/report/{report_id}/progress")


# ========================
# Interview Proxy
# ========================

class InterviewRequest(BaseModel):
    simulation_id: str
    agent_id: Optional[str] = None
    agent_ids: Optional[list[str]] = None
    question: str = ""


async def _local_interview(simulation_id: str, agent_id: str, question: str) -> dict:
    """Post-run interview using LLM with agent context."""
    profiles_resp = await mf_get(f"/simulation/{simulation_id}/profiles")
    profiles = []
    if profiles_resp.get("success") or profiles_resp.get("data"):
        pdata = profiles_resp.get("data", profiles_resp)
        profiles = pdata.get("profiles", pdata) if isinstance(pdata, dict) else pdata

    agent_profile = None
    for p in (profiles if isinstance(profiles, list) else []):
        uid = str(p.get("user_id", ""))
        if uid == str(agent_id) or p.get("name") == agent_id or p.get("username") == agent_id:
            agent_profile = p
            break

    if not agent_profile:
        return {"success": False, "error": f"Agent '{agent_id}' not found"}

    agent_name = agent_profile.get("name", agent_id)

    actions_resp = await mf_get(f"/simulation/{simulation_id}/actions", {"limit": 10000})
    all_actions = []
    if actions_resp.get("success") or actions_resp.get("data"):
        adata = actions_resp.get("data", actions_resp)
        all_actions = adata.get("actions", adata) if isinstance(adata, dict) else adata

    agent_actions = [
        a for a in (all_actions if isinstance(all_actions, list) else [])
        if str(a.get("agent_id", "")) == str(agent_profile.get("user_id", ""))
        or a.get("agent_name") == agent_name
    ]

    action_lines = []
    for a in agent_actions[-50:]:
        rnd = a.get("round_num", "?")
        atype = a.get("action_type", "action")
        args = a.get("action_args", {})
        content = args.get("content", args.get("quote_content", ""))
        platform = a.get("platform", "")
        line = f"Round {rnd} [{platform}] {atype}: {content[:200]}" if content else f"Round {rnd} [{platform}] {atype}"
        action_lines.append(line)

    actions_text = "\n".join(action_lines) if action_lines else "No actions recorded."
    persona = agent_profile.get("persona", agent_profile.get("bio", ""))

    prompt = f"""You are role-playing as "{agent_name}" in a completed historical simulation.
Respond in English only. Stay fully in character.

## Your Persona
Name: {agent_name}
Profile: {persona}

## Your Action History ({len(agent_actions)} total actions)
{actions_text}

## Interview Question
{question}

Answer as {agent_name}, reflecting on the decisions you made during the simulation."""

    try:
        answer = await llm_complete(prompt, max_tokens=2000, temperature=0.4)
        return {"success": True, "data": {"answer": answer, "source": "post-run"}}
    except Exception as e:
        return {"success": False, "error": f"LLM error: {str(e)}"}


@router.post("/api/mirofish/simulation/interview")
async def proxy_interview(body: InterviewRequest):
    """Interview an agent. Falls back to local LLM for completed sims."""
    data = body.model_dump(exclude_none=True)
    question = data.pop("question", "")
    data["prompt"] = "Respond in English only. Based on your persona and all past actions: " + question

    result = await mf_post("/simulation/interview", data)
    if result.get("success"):
        return result

    return await _local_interview(body.simulation_id, body.agent_id, question)
