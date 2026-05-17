"""Tests for POST /api/debug/sql (env-gated SQL executor)."""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.api import debug as debug_module
from app.database import get_db
from app.dependencies import get_current_user
from app.main import app


# ── disabled path (router not mounted without DEBUG_SQL_ENABLED) ──────────────

@pytest.mark.asyncio
async def test_debug_sql_disabled_returns_404(auth_client: AsyncClient, db_session: None) -> None:
    """Without DEBUG_SQL_ENABLED=true the route is not registered → 404."""
    resp = await auth_client.post("/api/debug/sql", json={"sql": "SELECT 1"})
    assert resp.status_code == 404


# ── enabled path: use a mini-app with the debug router mounted ────────────────

@pytest.fixture
async def debug_client(db_session: None) -> AsyncClient:
    """Async HTTP client wired to a mini FastAPI app with the debug router mounted.

    Re-uses the same in-memory SQLite session as db_session by copying the
    get_db override, and bypasses JWT auth with a lambda stub.
    """
    mini = FastAPI()
    mini.include_router(debug_module.router, prefix="/api")
    mini.dependency_overrides[get_db] = app.dependency_overrides[get_db]
    mini.dependency_overrides[get_current_user] = lambda: "testuser"

    async with AsyncClient(transport=ASGITransport(app=mini), base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_debug_sql_select(debug_client: AsyncClient) -> None:
    """A valid SELECT returns columns list and (possibly empty) rows array."""
    resp = await debug_client.post(
        "/api/debug/sql",
        json={"sql": "SELECT * FROM workout_sessions LIMIT 5"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "columns" in data
    assert "rows" in data
    assert "rowcount" in data
    assert isinstance(data["columns"], list)
    assert isinstance(data["rows"], list)
    # workout_sessions table exists and has expected columns
    assert "id" in data["columns"]
    assert data["rowcount"] == len(data["rows"])


@pytest.mark.asyncio
async def test_debug_sql_invalid(debug_client: AsyncClient) -> None:
    """An invalid query returns HTTP 400 with a non-empty error detail."""
    resp = await debug_client.post(
        "/api/debug/sql",
        json={"sql": "SELECT * FROM nonexistent_table_xyz"},
    )
    assert resp.status_code == 400
    detail = resp.json().get("detail", "")
    assert detail  # non-empty error message
