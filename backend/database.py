"""
MiroJiang — Async SQLite database layer using aiosqlite.
"""

import os
import aiosqlite
from typing import Any, Optional

DATABASE_PATH = os.environ.get("DATABASE_URL", "sqlite:///./mirojiang.db")
if DATABASE_PATH.startswith("sqlite:///"):
    DATABASE_PATH = DATABASE_PATH.replace("sqlite:///", "", 1)

if not os.path.isabs(DATABASE_PATH):
    DATABASE_PATH = os.path.join(os.path.dirname(__file__), DATABASE_PATH)

_CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS simulations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Untitled Simulation',
    status TEXT DEFAULT 'pending',
    history_file TEXT DEFAULT '{}',
    config TEXT DEFAULT '{}',
    nash_result TEXT DEFAULT '',
    state_vectors TEXT DEFAULT '{}',
    baseline_vectors TEXT DEFAULT '{}',
    triggered_pivots TEXT DEFAULT '{}',
    events TEXT DEFAULT '[]',
    current_round INTEGER DEFAULT 0,
    total_rounds INTEGER DEFAULT 40,
    summary TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);
"""


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DATABASE_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db():
    db = await get_db()
    try:
        await db.executescript(_CREATE_TABLES_SQL)
        await db.commit()
    finally:
        await db.close()


async def execute(sql: str, params: tuple = ()) -> Any:
    db = await get_db()
    try:
        cursor = await db.execute(sql, params)
        await db.commit()
        return cursor
    finally:
        await db.close()


async def fetchone(sql: str, params: tuple = ()) -> Optional[dict]:
    db = await get_db()
    try:
        cursor = await db.execute(sql, params)
        row = await cursor.fetchone()
        if row is None:
            return None
        return dict(row)
    finally:
        await db.close()


async def fetchall(sql: str, params: tuple = ()) -> list[dict]:
    db = await get_db()
    try:
        cursor = await db.execute(sql, params)
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()
