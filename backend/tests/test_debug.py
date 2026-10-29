"""Tests for POST /api/debug/sql (env-gated SQL executor)."""
from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.api import debug as debug_module
from app.config import Settings, settings
from app.database import get_db
from app.dependencies import get_current_user
from app.main import app, mount_debug_sql


def _gated_app() -> FastAPI:
    """A bare app that mounts the debug router through the gate, with DB and auth stubbed.

    Needs db_session (for the get_db override) and the flags patched on `settings`.
    """
    mini = FastAPI()
    mount_debug_sql(mini)
    mini.dependency_overrides[get_db] = app.dependency_overrides[get_db]
    mini.dependency_overrides[get_current_user] = lambda: "testuser"
    return mini


# ── disabled path (router not mounted without DEBUG_SQL_ENABLED) ──────────────

@pytest.mark.asyncio
async def test_debug_sql_disabled_returns_404(
    monkeypatch: pytest.MonkeyPatch, db_session: None
) -> None:
    """With the flags off the route is not registered → 404, whatever the shell's env."""
    monkeypatch.setattr(settings, "debug_sql_enabled", False)
    monkeypatch.setattr(settings, "demo_user_enabled", False)
    async with AsyncClient(transport=ASGITransport(app=_gated_app()), base_url="http://test") as c:
        resp = await c.post("/api/debug/sql", json={"sql": "SELECT 1"})
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

    async with AsyncClient(transport=ASGITransport(app=_gated_app()), base_url="http://test") as c:
        resp = await c.post("/api/debug/sql", json={"sql": "SELECT 1"})
    assert resp.status_code == (200 if expected else 404)

    profile = await auth_client.get("/api/profile")
    assert profile.status_code == 200
    assert profile.json()["debug_sql_available"] is expected

    # PATCH returns the same shape, so the page keeps the right value after a save
    patched = await auth_client.patch("/api/profile", json={"display_name": "Marie"})
    assert patched.json()["debug_sql_available"] is expected


BACKEND_DIR = Path(__file__).resolve().parents[1]
_GATE_ENV_NAMES = {"DEBUG_SQL_ENABLED", "DEMO_USER_ENABLED"}
_PROBE = (
    "import json\n"
    "from app.config import settings\n"
    "from app.main import app\n"
    "mounted = any(getattr(r, 'path', None) == '/api/debug/sql' for r in app.routes)\n"
    "print(json.dumps([mounted, settings.debug_sql_available]))\n"
)


@pytest.mark.parametrize(
    ("env", "expected"),
    [
        pytest.param(
            {"DEBUG_SQL_ENABLED": "true", "DEMO_USER_ENABLED": "true"}, True, id="dev-compose"
        ),
        pytest.param(
            {"DEBUG_SQL_ENABLED": "true", "DEMO_USER_ENABLED": "false"},
            False,
            id="prod-compose-with-flag-left-on",
        ),
        pytest.param(
            {
                "DEBUG_SQL_ENABLED": "true",
                "DEMO_USER_ENABLED": "false",
                "demo_user_enabled": "true",
                "debug_sql_enabled": "true",
            },
            False,
            id="prod-compose-with-lowercase-env-file-lines",
        ),
    ],
)
def test_real_app_mounts_route_exactly_when_available(env: dict[str, str], expected: bool) -> None:
    """A fresh import of app.main mounts /api/debug/sql exactly when debug_sql_available."""
    base = {k: v for k, v in os.environ.items() if k.upper() not in _GATE_ENV_NAMES}
    proc = subprocess.run(
        [sys.executable, "-c", _PROBE],
        env={**base, **env},
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr
    mounted, available = json.loads(proc.stdout.strip().splitlines()[-1])
    assert (mounted, available) == (expected, expected)


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
