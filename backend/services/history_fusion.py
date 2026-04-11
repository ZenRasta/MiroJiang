"""
History Fusion Service — Validates history files, applies counterfactuals,
and computes state vector divergence for the Predictive History framework.

Implements the Jiang Xueqin Predictive History framework.
"""

import json
import os
from typing import Any

DIMENSIONS = ["NARRATIVE", "POLITICAL", "ECONOMIC", "MILITARY"]
ZERO_VECTOR = {d: 0 for d in DIMENSIONS}

SAMPLE_HISTORY_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "sample_history_iran_trap.json"
)


def load_sample_history() -> dict:
    """Load the built-in Iran Trap sample history file."""
    with open(SAMPLE_HISTORY_PATH, "r") as f:
        return json.load(f)


def validate_history_file(data: Any) -> dict:
    """
    Validate a history file JSON object.
    Returns {"valid": bool, "errors": list[str]}
    """
    errors = []

    if not isinstance(data, dict):
        return {"valid": False, "errors": ["History file must be a JSON object"]}

    if not data.get("title"):
        errors.append('Missing or empty "title"')
    if not isinstance(data.get("period"), dict) or not data["period"].get("start") or not data["period"].get("end"):
        errors.append('Missing "period" with "start" and "end" fields')
    if not data.get("description"):
        errors.append('Missing or empty "description"')

    # Baseline timeline
    timeline = data.get("baselineTimeline")
    if not isinstance(timeline, list):
        errors.append('Missing "baselineTimeline" array')
    else:
        for i, evt in enumerate(timeline):
            if not evt.get("date"):
                errors.append(f"baselineTimeline[{i}]: missing 'date'")
            if not evt.get("description"):
                errors.append(f"baselineTimeline[{i}]: missing 'description'")
            dims = evt.get("dimensionsAffected", [])
            if not isinstance(dims, list):
                errors.append(f"baselineTimeline[{i}]: 'dimensionsAffected' must be an array")
            else:
                for d in dims:
                    if d not in DIMENSIONS:
                        errors.append(f"baselineTimeline[{i}]: invalid dimension '{d}'")

    # Pivot points
    pivots = data.get("pivotPoints")
    if not isinstance(pivots, list):
        errors.append('Missing "pivotPoints" array')
    else:
        pivot_ids = set()
        for i, pp in enumerate(pivots):
            pid = pp.get("id", "")
            if not pid:
                errors.append(f"pivotPoints[{i}]: missing 'id'")
            if pid in pivot_ids:
                errors.append(f"pivotPoints[{i}]: duplicate id '{pid}'")
            pivot_ids.add(pid)
            if not pp.get("date"):
                errors.append(f"pivotPoints[{i}]: missing 'date'")
            if not pp.get("description"):
                errors.append(f"pivotPoints[{i}]: missing 'description'")
            if not pp.get("counterfactualPrompt"):
                errors.append(f"pivotPoints[{i}]: missing 'counterfactualPrompt'")
            if not pp.get("defaultOutcome"):
                errors.append(f"pivotPoints[{i}]: missing 'defaultOutcome'")
            alts = pp.get("alternateOutcomes", [])
            if not isinstance(alts, list) or len(alts) == 0:
                errors.append(f"pivotPoints[{i}]: must have at least one alternateOutcome")
            else:
                for j, ao in enumerate(alts):
                    if not ao.get("id"):
                        errors.append(f"pivotPoints[{i}].alternateOutcomes[{j}]: missing 'id'")
                    if not ao.get("description"):
                        errors.append(f"pivotPoints[{i}].alternateOutcomes[{j}]: missing 'description'")
                    deltas = ao.get("stateDeltasByActor")
                    if not isinstance(deltas, dict):
                        errors.append(f"pivotPoints[{i}].alternateOutcomes[{j}]: missing 'stateDeltasByActor'")

    # Structural analogies
    analogies = data.get("structuralAnalogies")
    if not isinstance(analogies, list):
        errors.append('Missing "structuralAnalogies" array')
    else:
        for i, sa in enumerate(analogies):
            for field in ("pattern", "historicalCase", "relevance", "projectedConsequence"):
                if not sa.get(field):
                    errors.append(f"structuralAnalogies[{i}]: missing '{field}'")

    # Initial state vectors
    vectors = data.get("initialStateVectors")
    if not isinstance(vectors, dict):
        errors.append('Missing "initialStateVectors" object')
    else:
        for actor_id, vec in vectors.items():
            for dim in DIMENSIONS:
                val = vec.get(dim)
                if not isinstance(val, (int, float)):
                    errors.append(f"initialStateVectors.{actor_id}: missing or non-numeric '{dim}'")
                elif val < -100 or val > 100:
                    errors.append(f"initialStateVectors.{actor_id}.{dim}: value {val} out of range [-100, +100]")

    # Game theory nodes
    nodes = data.get("gameTheoryNodes")
    if not isinstance(nodes, list):
        errors.append('Missing "gameTheoryNodes" array')
    else:
        for i, gtn in enumerate(nodes):
            if not gtn.get("pivotPointId"):
                errors.append(f"gameTheoryNodes[{i}]: missing 'pivotPointId'")
            if not gtn.get("actorId"):
                errors.append(f"gameTheoryNodes[{i}]: missing 'actorId'")
            opts = gtn.get("options", [])
            if not isinstance(opts, list) or len(opts) == 0:
                errors.append(f"gameTheoryNodes[{i}]: must have at least one option")

    return {"valid": len(errors) == 0, "errors": errors}


def build_baseline_snapshots(initial_vectors: dict, history: dict) -> list:
    """
    Build baseline state vector snapshots at each timeline event date.
    This provides the reference for divergence calculations.
    """
    snapshots = [{"date": history.get("period", {}).get("start", ""), "vectors": dict(initial_vectors)}]

    current = {aid: dict(vec) for aid, vec in initial_vectors.items()}
    for pp in sorted(history.get("pivotPoints", []), key=lambda p: p.get("date", "")):
        snapshots.append({
            "date": pp.get("date", ""),
            "pivotPointId": pp.get("id", ""),
            "outcome": "baseline",
            "vectors": {aid: dict(vec) for aid, vec in current.items()},
        })

    return snapshots


def build_history_seed_text(history: dict) -> str:
    """
    Convert a history file to a markdown string suitable for MiroFish upload.
    """
    lines = []

    lines.append(f"# {history.get('title', 'Predictive History Simulation')}")
    lines.append("")
    period = history.get("period", {})
    lines.append(f"**Period:** {period.get('start', '?')} to {period.get('end', '?')}")
    lines.append("")
    lines.append(history.get("description", ""))
    lines.append("")

    # Actors with state vectors
    initial_vectors = history.get("initialStateVectors", {})
    lines.append("## Actors and Initial State Vectors")
    lines.append("")
    for actor_id, sv in initial_vectors.items():
        actor_display = actor_id.replace("_", " ").title()
        lines.append(f"### {actor_display}")
        lines.append(f"- **ID:** {actor_id}")
        lines.append(f"- **State Vector:** N={sv.get('NARRATIVE',0)} P={sv.get('POLITICAL',0)} E={sv.get('ECONOMIC',0)} M={sv.get('MILITARY',0)}")
        lines.append("")

    # Baseline timeline
    lines.append("## Baseline Timeline")
    lines.append("")
    for evt in history.get("baselineTimeline", []):
        dims = ", ".join(evt.get("dimensionsAffected", []))
        lines.append(f"- **{evt.get('date', '?')}** [{dims}]: {evt.get('description', '')}")
    lines.append("")

    # Pivot points
    lines.append("## Pivot Points")
    lines.append("")
    for pp in history.get("pivotPoints", []):
        lines.append(f"### {pp.get('id', '')} — {pp.get('date', '')}")
        lines.append(f"**Description:** {pp.get('description', '')}")
        lines.append(f"**Counterfactual:** {pp.get('counterfactualPrompt', '')}")
        lines.append(f"**Default Outcome:** {pp.get('defaultOutcome', '')}")
        for ao in pp.get("alternateOutcomes", []):
            lines.append(f"- **Alt [{ao.get('id', '')}]:** {ao.get('description', '')}")
        lines.append("")

    # Structural analogies
    lines.append("## Structural Analogies")
    lines.append("")
    for sa in history.get("structuralAnalogies", []):
        lines.append(f"### {sa.get('pattern', '')}")
        lines.append(f"**Historical Case:** {sa.get('historicalCase', '')}")
        lines.append(f"**Relevance:** {sa.get('relevance', '')}")
        lines.append(f"**Projected Consequence:** {sa.get('projectedConsequence', '')}")
        lines.append("")

    # Game theory summary
    lines.append("## Game Theory Decision Nodes")
    lines.append("")
    for gtn in history.get("gameTheoryNodes", []):
        lines.append(f"**Pivot:** {gtn.get('pivotPointId', '')} | **Actor:** {gtn.get('actorId', '')}")
        for opt in gtn.get("options", []):
            payoffs = opt.get("payoffsByScenario", {})
            payoff_str = ", ".join(f"{k}={v}" for k, v in payoffs.items())
            lines.append(f"  - {opt.get('action', '?')}: [{payoff_str}]")
            conds = opt.get("conditions", [])
            if conds:
                lines.append(f"    Conditions: {'; '.join(conds)}")
        lines.append("")

    return "\n".join(lines)


def build_predictive_history_requirement(history: dict, ph_template: str) -> str:
    """
    Build the full predictive history system prompt by filling the template
    with data from the history file.
    """
    analogies_text = "\n".join(
        f"- {sa['pattern']}: {sa['historicalCase']} — {sa['projectedConsequence']}"
        for sa in history.get("structuralAnalogies", [])
    )
    gt_text = "\n".join(
        f"- Pivot: {gtn['pivotPointId']} | Actor: {gtn['actorId']} | "
        f"Options: {', '.join(o['action'] for o in gtn.get('options', []))}"
        for gtn in history.get("gameTheoryNodes", [])
    )
    pp_text = "\n".join(
        f"- [{pp['id']}] {pp['date']}: {pp['description']}"
        for pp in history.get("pivotPoints", [])
    )
    timeline_text = "\n".join(
        f"- {evt['date']}: {evt['description']}"
        for evt in history.get("baselineTimeline", [])
    )
    vectors_text = "\n".join(
        f"- {aid}: N={v.get('NARRATIVE',0)} P={v.get('POLITICAL',0)} "
        f"E={v.get('ECONOMIC',0)} M={v.get('MILITARY',0)}"
        for aid, v in history.get("initialStateVectors", {}).items()
    )

    period = history.get("period", {})
    return ph_template.format(
        structural_analogies=analogies_text or "None loaded",
        game_theory_nodes=gt_text or "None loaded",
        pivot_points=pp_text or "None loaded",
        history_title=history.get("title", ""),
        history_period=f"{period.get('start', '?')} to {period.get('end', '?')}",
        history_description=history.get("description", ""),
        baseline_timeline=timeline_text or "None loaded",
        initial_state_vectors=vectors_text or "None loaded",
    )


def actors_from_history(history: dict) -> list[dict]:
    """
    Synthesize an actors list from a history file for Nash analysis.
    Builds actors from initialStateVectors keys + gameTheoryNodes options.
    """
    initial_vectors = history.get("initialStateVectors", {})
    game_nodes = history.get("gameTheoryNodes", [])

    # Build action sets per actor from game theory nodes
    actor_actions: dict[str, list[str]] = {}
    for gtn in game_nodes:
        aid = gtn.get("actorId", "")
        if aid:
            actions = [o.get("action", "") for o in gtn.get("options", []) if o.get("action")]
            if aid not in actor_actions:
                actor_actions[aid] = []
            actor_actions[aid].extend(a for a in actions if a not in actor_actions[aid])

    default_actions = ["cooperate", "compete", "negotiate", "withdraw"]

    actors = []
    for actor_id in initial_vectors:
        actor_display = actor_id.replace("_", " ").title()
        actors.append({
            "id": actor_id,
            "name": actor_display,
            "available_actions": actor_actions.get(actor_id, default_actions),
            "goals": [],
            "relationships": [],
        })

    return actors


def apply_counterfactual(
    current_vectors: dict[str, dict],
    alternate_outcome: dict,
) -> dict[str, dict]:
    """
    Apply an alternate outcome's state deltas to actor state vectors.
    Returns new vectors (does not mutate input).
    """
    updated = {aid: dict(vec) for aid, vec in current_vectors.items()}
    for actor_id, delta in alternate_outcome.get("stateDeltasByActor", {}).items():
        if actor_id not in updated:
            updated[actor_id] = dict(ZERO_VECTOR)
        for dim in DIMENSIONS:
            if dim in delta:
                updated[actor_id][dim] = max(-100, min(100, updated[actor_id][dim] + delta[dim]))
    return updated


def compute_divergence(current: dict, baseline: dict) -> dict:
    """Compute per-actor, per-dimension divergence from baseline."""
    all_actors = set(list(current.keys()) + list(baseline.keys()))
    divergence = {}
    for actor_id in sorted(all_actors):
        cur = current.get(actor_id, ZERO_VECTOR)
        base = baseline.get(actor_id, ZERO_VECTOR)
        divergence[actor_id] = {dim: cur.get(dim, 0) - base.get(dim, 0) for dim in DIMENSIONS}
    return divergence
