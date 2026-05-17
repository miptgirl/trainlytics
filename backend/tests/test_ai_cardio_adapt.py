"""Tests for POST /ai/adapt-cardio-session (Group 5.2)."""

from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.ai_request_log import AiRequestLog


def _monday_of_week(d: date) -> date:
    return d - timedelta(days=d.weekday())


TODAY = date.today()
THIS_MONDAY = _monday_of_week(TODAY)


async def _create_cardio_type(client: AsyncClient, name: str = "Run") -> int:
    resp = await client.post("/api/cardio-types", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_planned_cardio_session(client: AsyncClient, activity_type_id: int) -> int:
    resp = await client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": THIS_MONDAY.isoformat(),
            "session_type": "cardio",
            "activity_type_id": activity_type_id,
            "segments": [
                {
                    "segment_order": 1,
                    "distance_metres": 8000,
                    "duration_secs": 3000,
                    "pace_secs_per_km": 375,
                }
            ],
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _make_anthropic_response(text: str = "Reduce distance to 5km."):
    usage = SimpleNamespace(input_tokens=60, output_tokens=40)
    content = [SimpleNamespace(text=text)]
    return SimpleNamespace(content=content, usage=usage)


# ── Tests ────────────────────────────────────────────────────────────────────


async def test_adapt_cardio_402_no_api_key(db_session, auth_client: AsyncClient):
    resp = await auth_client.post(
        "/api/ai/adapt-cardio-session",
        json={"planned_session_id": 1, "complaint": "My knee hurts"},
    )
    assert resp.status_code == 402


async def test_adapt_cardio_404_unknown_session(db_session, auth_client: AsyncClient):
    await auth_client.patch(
        "/api/profile",
        json={"anthropic_api_key": "sk-ant-fake-key", "ai_provider": "anthropic"},
    )

    with patch("anthropic.Anthropic") as MockAnthropic:
        instance = MagicMock()
        instance.messages.create.return_value = _make_anthropic_response()
        MockAnthropic.return_value = instance

        resp = await auth_client.post(
            "/api/ai/adapt-cardio-session",
            json={"planned_session_id": 9999, "complaint": "My knee hurts"},
        )

    assert resp.status_code == 404


async def test_adapt_cardio_happy_path_returns_response(db_session, auth_client: AsyncClient):
    activity_id = await _create_cardio_type(auth_client)
    planned_session_id = await _create_planned_cardio_session(auth_client, activity_id)

    await auth_client.patch(
        "/api/profile",
        json={"anthropic_api_key": "sk-ant-fake-key", "ai_provider": "anthropic"},
    )

    fake_text = "Reduce distance to 4km and walk the last 2km."
    with patch("anthropic.Anthropic") as MockAnthropic:
        instance = MagicMock()
        instance.messages.create.return_value = _make_anthropic_response(fake_text)
        MockAnthropic.return_value = instance

        resp = await auth_client.post(
            "/api/ai/adapt-cardio-session",
            json={"planned_session_id": planned_session_id, "complaint": "knee soreness"},
        )

    assert resp.status_code == 200
    assert resp.json()["response"] == fake_text


async def test_adapt_cardio_logs_request(db_session, auth_client: AsyncClient):
    activity_id = await _create_cardio_type(auth_client)
    planned_session_id = await _create_planned_cardio_session(auth_client, activity_id)

    await auth_client.patch(
        "/api/profile",
        json={"anthropic_api_key": "sk-ant-fake-key", "ai_provider": "anthropic"},
    )

    with patch("anthropic.Anthropic") as MockAnthropic:
        instance = MagicMock()
        instance.messages.create.return_value = _make_anthropic_response("Take a rest day.")
        MockAnthropic.return_value = instance

        await auth_client.post(
            "/api/ai/adapt-cardio-session",
            json={"planned_session_id": planned_session_id, "complaint": "I feel exhausted"},
        )

    from app.database import get_db
    from app.main import app

    db_gen = app.dependency_overrides[get_db]
    async for db in db_gen():
        result = await db.execute(
            select(AiRequestLog).where(AiRequestLog.endpoint == "adapt-cardio-session")
        )
        rows = result.scalars().all()
        break

    assert len(rows) == 1
    row = rows[0]
    assert row.endpoint == "adapt-cardio-session"
    assert row.provider == "anthropic"
    assert row.response == "Take a rest day."
    assert row.error is None
