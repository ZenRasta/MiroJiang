"""
Predictive History router — history file validation, sample data,
counterfactual injection, and divergence report endpoints.
"""

import json
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from services.history_fusion import (
    validate_history_file,
    load_sample_history,
    apply_counterfactual,
    compute_divergence,
)

router = APIRouter(prefix="/api/history", tags=["predictive-history"])


@router.post("/validate")
async def validate_history(file: UploadFile = File(...)):
    """Upload and validate a history file JSON."""
    content = await file.read()
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        return {
            "success": False,
            "data": {"valid": False, "errors": [f"Invalid JSON: {str(e)}"]},
        }

    result = validate_history_file(data)
    return {"success": True, "data": result}


class HistoryValidateBody(BaseModel):
    history: dict


@router.post("/validate-json")
async def validate_history_json(body: HistoryValidateBody):
    """Validate a history file JSON object (already parsed)."""
    result = validate_history_file(body.history)
    return {"success": True, "data": result}


@router.get("/sample")
async def get_sample_history():
    """Return the built-in Iran Trap sample history file."""
    try:
        data = load_sample_history()
        return {"success": True, "data": data}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Sample history file not found")


class InjectCounterfactualBody(BaseModel):
    current_vectors: dict
    alternate_outcome_id: str
    history: dict


@router.post("/inject-counterfactual")
async def inject_counterfactual(body: InjectCounterfactualBody):
    """Apply a counterfactual alternate outcome to current state vectors."""
    alt_outcome = None
    pivot_point_id = None
    for pp in body.history.get("pivotPoints", []):
        for ao in pp.get("alternateOutcomes", []):
            if ao.get("id") == body.alternate_outcome_id:
                alt_outcome = ao
                pivot_point_id = pp.get("id")
                break
        if alt_outcome:
            break

    if not alt_outcome:
        raise HTTPException(
            status_code=404,
            detail=f"Alternate outcome '{body.alternate_outcome_id}' not found",
        )

    updated = apply_counterfactual(body.current_vectors, alt_outcome)
    divergence = compute_divergence(updated, body.current_vectors)

    return {
        "success": True,
        "data": {
            "updatedVectors": updated,
            "divergence": divergence,
            "pivotPointId": pivot_point_id,
            "alternateOutcomeId": body.alternate_outcome_id,
            "description": alt_outcome.get("description", ""),
            "unlocksPivotPoints": alt_outcome.get("unlocksPivotPoints", []),
            "blockedByPivotPoints": alt_outcome.get("blockedByPivotPoints", []),
        },
    }


class DivergenceReportBody(BaseModel):
    history: dict
    current_vectors: dict
    triggered_pivots: dict
    simulation_summary: Optional[str] = ""


@router.post("/divergence-report")
async def generate_divergence_report(body: DivergenceReportBody):
    """Generate a Historical Divergence Report as markdown."""
    from services.divergence_report import build_divergence_report

    report = build_divergence_report(
        history=body.history,
        current_vectors=body.current_vectors,
        triggered_pivots=body.triggered_pivots,
        simulation_summary=body.simulation_summary or "",
    )
    return {"success": True, "data": {"markdown": report}}
