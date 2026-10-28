"""Tests for POST /api/debug/sql (env-gated SQL executor)."""
from __future__ import annotations

import logging

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.api import debug as debug_module
from app.config import Settings, settings
from app.database import get_db
from app.dependencies import get_current_user
from app.main import app, mount_debug_sql


# ── disabled path (router not mounted without DEBUG_SQL_ENABLED) ──────────────

@pytest.mark.asyncio
async def test_debug_sql_disabled_returns_404(auth_client: AsyncClient, db_session: None) -> None:
    """Without DEBUG_SQL_ENABLED=true the route is not registered → 404."""
    resp = await auth_client.post("/api/debug/sql", json={"sql": "SELECT 1"})
    assert resp.status_code == 404


# ── gate: mounted only on the local dev stack (DEMO_USER_ENABLED=true) ────────

# (DEBUG_SQL_ENABLED, DEMO_USER_ENABLED) → executor available
GATE_CASES = [
    pytest.param("true", "true", True, id="dev-compose"),
    pytest.param("true", "false", False, id="prod-compose-with-flag-left-on"),
    pytest.param("false", "true", False, id="flag-off"),
    pytest.param(None, None, False, id="nothing-set"),
]


@pytest.mark.parametrize(("debug_sql", "demo_user", "expected"), GATE_CASES)
def test_availability_follows_env(
    monkeypatch: pytest.MonkeyPatch, debug_sql: str | None, demo_user: str | None, expected: bool
) -> None:
    """The env vars the compose files set reach Settings.debug_sql_available."""
    for name, value in (("DEBUG_SQL_ENABLED", debug_sql), ("DEMO_USER_ENABLED", demo_user)):
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)
    assert Settings(_env_file=None).debug_sql_available is expected


@pytest.mark.parametrize(("debug_sql", "demo_user", "expected"), GATE_CASES)
async def test_route_and_profile_field_agree(
    monkeypatch: pytest.MonkeyPatch,
    auth_client: AsyncClient,
    db_session: None,
    debug_sql: str | None,
    demo_user: str | None,
    expected: bool,
) -> None:
    """The route is mounted exactly when GET /profile reports debug_sql_available."""
    monkeypatch.setattr(settings, "debug_sql_enabled", debug_sql == "true")
    monkeypatch.setattr(settings, "demo_user_enabled", demo_user == "true")

    mini = FastAPI()
    mount_debug_sql(mini)
    mini.dependency_overrides[get_db] = app.dependency_overrides[get_db]
    mini.dependency_overrides[get_current_user] = lambda: "testuser"
    async with AsyncClient(transport=ASGITransport(app=mini), base_url="http://test") as c:
        resp = await c.post("/api/debug/sql", json={"sql": "SELECT 1"})
    assert resp.status_code == (200 if expected else 404)

    profile = await auth_client.get("/api/profile")
    assert profile.status_code == 200
    assert profile.json()["debug_sql_available"] is expected

    # PATCH returns the same shape, so the page keeps the right value after a save
    patched = await auth_client.patch("/api/profile", json={"display_name": "Marie"})
    assert patched.json()["debug_sql_available"] is expected


def test_flag_without_dev_stack_logs_warning(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(settings, "debug_sql_enabled", True)
    monkeypatch.setattr(settings, "demo_user_enabled", False)
    with caplog.at_level(logging.WARNING, logger="trainlytics"):
        mount_debug_sql(FastAPI())
    assert "DEBUG_SQL_ENABLED is ignored" in caplog.text


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
