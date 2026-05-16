"""Tests for AI endpoints and ai_service helpers."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_request_log import AiRequestLog
from app.services.ai_service import compact_cardio_segments, compact_sets
from app.services.crypto import encrypt
from tests.conftest import TEST_USERNAME

# ── compact_sets ──────────────────────────────────────────────────────────────


def test_compact_sets_empty():
    assert compact_sets([]) == ""


def test_compact_sets_single():
    s = SimpleNamespace(reps=5, weight=100.0)
    assert compact_sets([s]) == "5@100kg"


def test_compact_sets_all_identical():
    sets = [SimpleNamespace(reps=5, weight=100.0)] * 5
    assert compact_sets(sets) == "5×5@100kg"


def test_compact_sets_mixed():
    sets = [
        SimpleNamespace(reps=10, weight=60.0),
        SimpleNamespace(reps=5, weight=90.0),
        SimpleNamespace(reps=5, weight=90.0),
        SimpleNamespace(reps=4, weight=90.0),
    ]
    result = compact_sets(sets)
    assert result == "10@60kg, 2×5@90kg, 4@90kg"


def test_compact_sets_all_different():
    sets = [
        SimpleNamespace(reps=10, weight=60.0),
        SimpleNamespace(reps=8, weight=70.0),
        SimpleNamespace(reps=6, weight=80.0),
    ]
    result = compact_sets(sets)
    assert result == "10@60kg, 8@70kg, 6@80kg"


def test_compact_sets_dict_input():
    """compact_sets also works with dict-style items (as sent from frontend snapshot)."""
    sets = [
        {"reps": 5, "weight_kg": 100.0},
        {"reps": 5, "weight_kg": 100.0},
        {"reps": 3, "weight_kg": 110.0},
    ]
    assert compact_sets(sets) == "2×5@100kg, 3@110kg"


# ── compact_cardio_segments ───────────────────────────────────────────────────


def test_compact_cardio_segments_empty():
    assert compact_cardio_segments([]) == ""


def test_compact_cardio_segments_single():
    seg = SimpleNamespace(distance_meters=1000.0, pace_seconds_per_km=300.0, duration_seconds=300)
    assert compact_cardio_segments([seg]) == "1km in 5:00/km"


def test_compact_cardio_segments_all_identical():
    seg = SimpleNamespace(distance_meters=1000.0, pace_seconds_per_km=300.0, duration_seconds=300)
    result = compact_cardio_segments([seg, seg, seg])
    assert result == "3×1km in 5:00/km"


def test_compact_cardio_segments_mixed():
    warm = SimpleNamespace(distance_meters=500.0, pace_seconds_per_km=360.0, duration_seconds=180)
    fast = SimpleNamespace(distance_meters=1000.0, pace_seconds_per_km=240.0, duration_seconds=240)
    result = compact_cardio_segments([warm, fast, fast])
    assert result == "0.5km in 6:00/km; 2×1km in 4:00/km"


# ── AI endpoint tests (mocked SDKs) ──────────────────────────────────────────


def _make_anthropic_response(text: str = "Great week!"):
    """Build a minimal fake Anthropic response object."""
    usage = SimpleNamespace(input_tokens=50, output_tokens=30)
    content = [SimpleNamespace(text=text)]
    return SimpleNamespace(content=content, usage=usage)


def _make_openai_response(text: str = "Great week!"):
    """Build a minimal fake OpenAI completion object."""
    message = SimpleNamespace(content=text)
    choice = SimpleNamespace(message=message)
    usage = SimpleNamespace(prompt_tokens=50, completion_tokens=30)
    return SimpleNamespace(choices=[choice], usage=usage)


@pytest.mark.anyio
async def test_weekly_insights_402_no_key(db_session, auth_client: AsyncClient):
    """Returns 402 when no API key is configured."""
    resp = await auth_client.post("/api/ai/weekly-insights")
    assert resp.status_code == 402


@pytest.mark.anyio
async def test_adapt_session_402_no_key(db_session, auth_client: AsyncClient):
    """Returns 402 when no API key is configured."""
    payload = {
        "session_snapshot": {"exercises": []},
        "user_message": "My knee hurts",
    }
    resp = await auth_client.post("/api/ai/adapt-session", json=payload)
    assert resp.status_code == 402


@pytest.mark.anyio
async def test_weekly_insights_happy_path_anthropic(db_session, auth_client: AsyncClient):
    """Happy path: returns analysis string when Anthropic key is set."""
    # Set up API key via profile endpoint
    await auth_client.patch(
        "/api/profile",
        json={"anthropic_api_key": "sk-ant-fake-key", "ai_provider": "anthropic"},
    )

    fake_response = _make_anthropic_response("Nice training week!")

    with patch("anthropic.Anthropic") as MockAnthropic:
        instance = MagicMock()
        instance.messages.create.return_value = fake_response
        MockAnthropic.return_value = instance

        resp = await auth_client.post("/api/ai/weekly-insights")

    assert resp.status_code == 200
    data = resp.json()
    assert "analysis" in data
    assert data["analysis"] == "Nice training week!"


@pytest.mark.anyio
async def test_adapt_session_happy_path_anthropic(db_session, auth_client: AsyncClient):
    """Happy path: returns suggestions string when Anthropic key is set."""
    await auth_client.patch(
        "/api/profile",
        json={"anthropic_api_key": "sk-ant-fake-key", "ai_provider": "anthropic"},
    )

    fake_response = _make_anthropic_response("Swap squats for leg press.")

    with patch("anthropic.Anthropic") as MockAnthropic:
        instance = MagicMock()
        instance.messages.create.return_value = fake_response
        MockAnthropic.return_value = instance

        payload = {
            "session_snapshot": {
                "template_name": "Push A",
                "exercises": [
                    {
                        "exercise_id": 1,
                        "exercise_name": "Squat",
                        "sets": [{"reps": 5, "weight_kg": 100}],
                    }
                ],
            },
            "user_message": "Left knee is sore",
        }
        resp = await auth_client.post("/api/ai/adapt-session", json=payload)

    assert resp.status_code == 200
    assert resp.json()["suggestions"] == "Swap squats for leg press."


@pytest.mark.anyio
async def test_weekly_insights_writes_log_row(db_session, auth_client: AsyncClient):
    """Successful call writes a row to ai_request_logs with correct fields."""
    await auth_client.patch(
        "/api/profile",
        json={"anthropic_api_key": "sk-ant-fake-key", "ai_provider": "anthropic"},
    )

    fake_response = _make_anthropic_response("Good progress!")

    with patch("anthropic.Anthropic") as MockAnthropic:
        instance = MagicMock()
        instance.messages.create.return_value = fake_response
        MockAnthropic.return_value = instance

        await auth_client.post("/api/ai/weekly-insights")

    # Query the log row directly via the db override
    from app.database import get_db
    from app.main import app

    db_gen = app.dependency_overrides[get_db]
    async for db in db_gen():
        result = await db.execute(select(AiRequestLog).where(AiRequestLog.username == TEST_USERNAME))
        rows = result.scalars().all()
        break

    assert len(rows) == 1
    row = rows[0]
    assert row.endpoint == "weekly-insights"
    assert row.provider == "anthropic"
    assert row.model is not None
    assert row.response == "Good progress!"
    assert row.input_tokens == 50
    assert row.output_tokens == 30
    assert row.error is None


@pytest.mark.anyio
async def test_adapt_session_writes_log_row(db_session, auth_client: AsyncClient):
    """Successful adapt-session call writes a row with endpoint='adapt-session'."""
    await auth_client.patch(
        "/api/profile",
        json={"anthropic_api_key": "sk-ant-fake-key", "ai_provider": "anthropic"},
    )

    fake_response = _make_anthropic_response("Try lighter weights.")

    with patch("anthropic.Anthropic") as MockAnthropic:
        instance = MagicMock()
        instance.messages.create.return_value = fake_response
        MockAnthropic.return_value = instance

        payload = {
            "session_snapshot": {"exercises": []},
            "user_message": "Feeling tired",
        }
        await auth_client.post("/api/ai/adapt-session", json=payload)

    from app.database import get_db
    from app.main import app

    db_gen = app.dependency_overrides[get_db]
    async for db in db_gen():
        result = await db.execute(select(AiRequestLog).where(AiRequestLog.username == TEST_USERNAME))
        rows = result.scalars().all()
        break

    assert len(rows) == 1
    assert rows[0].endpoint == "adapt-session"


@pytest.mark.anyio
async def test_failed_ai_call_writes_log_with_error(db_session, auth_client: AsyncClient):
    """SDK exception writes a log row with error set; HTTP handler gets a 502, not 500."""
    await auth_client.patch(
        "/api/profile",
        json={"anthropic_api_key": "sk-ant-fake-key", "ai_provider": "anthropic"},
    )

    with patch("anthropic.Anthropic") as MockAnthropic:
        instance = MagicMock()
        instance.messages.create.side_effect = Exception("Invalid API key")
        MockAnthropic.return_value = instance

        resp = await auth_client.post("/api/ai/weekly-insights")

    # API should return 502 (not re-raise as 500)
    assert resp.status_code == 502

    # Log row should exist with error set and response null
    from app.database import get_db
    from app.main import app

    db_gen = app.dependency_overrides[get_db]
    async for db in db_gen():
        result = await db.execute(select(AiRequestLog).where(AiRequestLog.username == TEST_USERNAME))
        rows = result.scalars().all()
        break

    assert len(rows) == 1
    row = rows[0]
    assert row.error is not None
    assert "Invalid API key" in row.error
    assert row.response is None
