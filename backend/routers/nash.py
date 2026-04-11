"""
Nash equilibrium analysis router.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from services.nash_engine import analyse_seed

router = APIRouter(prefix="/api/nash", tags=["nash"])


class NashAnalyseRequest(BaseModel):
    seed: dict
    llm_enhanced: bool = False


@router.post("/analyse")
async def nash_analyse(body: NashAnalyseRequest):
    """
    Accept a seed JSON and run Nash equilibrium analysis.
    Returns computed equilibria with optimal strategies per actor.
    """
    try:
        result = await analyse_seed(body.seed)
        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "error": str(e)}
