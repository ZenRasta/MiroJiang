"""
MiroFish backend proxy — async HTTP helpers for forwarding requests.
"""

import os
import httpx
from typing import Any, Optional

MIROFISH_API = os.environ.get("MIROFISH_API", "http://localhost:5001/api")

ENGLISH_INSTRUCTION = (
    "IMPORTANT: ALL output — reports, analysis, agent profiles, social media posts, "
    "interviews, and communications — MUST be written entirely in English. "
    "Do NOT use Chinese, Spanish, or any other language. English only."
)


async def mf_get(path: str, params: Optional[dict] = None) -> dict:
    """Proxy GET to MiroFish backend."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f"{MIROFISH_API}{path}", params=params)
            return r.json()
    except Exception as e:
        return {"success": False, "error": str(e)}


async def mf_post(path: str, data: Optional[dict] = None) -> dict:
    """Proxy POST JSON to MiroFish backend."""
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{MIROFISH_API}{path}", json=data or {})
            return r.json()
    except Exception as e:
        return {"success": False, "error": str(e)}


async def mf_post_multipart(
    path: str,
    fields: Optional[dict] = None,
    files: Optional[dict] = None,
) -> dict:
    """Proxy multipart POST to MiroFish backend."""
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(
                f"{MIROFISH_API}{path}",
                data=fields or {},
                files=files or {},
            )
            return r.json()
    except Exception as e:
        return {"success": False, "error": str(e)}


async def mf_delete(path: str) -> dict:
    """Proxy DELETE to MiroFish backend."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.delete(f"{MIROFISH_API}{path}")
            return r.json()
    except Exception as e:
        return {"success": False, "error": str(e)}
