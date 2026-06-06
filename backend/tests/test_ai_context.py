"""Tests for the health context block injected into AI prompts."""

from __future__ import annotations

import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

from app.models.body_metrics import BodyMetrics
from app.models.user_settings import UserSettings
from app.services.ai_service import get_health_context_block
from tests.conftest import TEST_USERNAME


def _settings(**overrides) -> UserSettings:
    defaults = dict(
        username=TEST_USERNAME,
        health_metric_resting_hr=True,
        health_metric_hrv=True,
        health_metric_weight=True,
        health_metric_sleep=True,
        health_metric_vo2_max=True,
        health_metric_active_energy=True,
    )
    defaults.update(overrides)
    return UserSettings(**defaults)


async def _insert(db, date: datetime.date, **values) -> None:
    db.add(BodyMetrics(date=date, **values))
    await db.commit()


# ── Returns None when no data ─────────────────────────────────────────────────


@pytest.mark.anyio
async def test_health_block_none_when_no_rows(db_session):
    async with db_session() as db:
        result = await get_health_context_block(_settings(), db)
    assert result is None


@pytest.mark.anyio
async def test_health_block_none_when_all_metrics_disabled(db_session):
    today = datetime.date.today()
    async with db_session() as db:
        await _insert(db, today - datetime.timedelta(days=1), resting_hr_bpm=55.0)
        result = await get_health_context_block(
            _settings(
                health_metric_resting_hr=False,
                health_metric_hrv=False,
                health_metric_weight=False,
                health_metric_sleep=False,
                health_metric_vo2_max=False,
                health_metric_active_energy=False,
            ),
            db,
        )
    assert result is None


@pytest.mark.anyio
async def test_health_block_none_when_data_outside_all_windows(db_session):
    """Data that falls outside every window should yield None."""
    today = datetime.date.today()
    async with db_session() as db:
        # Day −200 falls between the ~3mo and ~1yr windows
        await _insert(db, today - datetime.timedelta(days=200), resting_hr_bpm=55.0)
        result = await get_health_context_block(_settings(), db)
    assert result is None


# ── Correct formatting when data exists ──────────────────────────────────────


@pytest.mark.anyio
async def test_health_block_has_correct_headers(db_session):
    today = datetime.date.today()
    async with db_session() as db:
        await _insert(db, today - datetime.timedelta(days=2), resting_hr_bpm=52.0)
        result = await get_health_context_block(_settings(), db)

    assert result is not None
    assert "Health metrics (weekly averages):" in result
    assert "Now" in result
    assert "~1mo ago" in result
    assert "~3mo ago" in result
    assert "~1yr ago" in result


@pytest.mark.anyio
async def test_health_block_shows_now_value(db_session):
    today = datetime.date.today()
    async with db_session() as db:
        await _insert(db, today - datetime.timedelta(days=2), resting_hr_bpm=52.0)
        result = await get_health_context_block(
            _settings(
                health_metric_hrv=False,
                health_metric_weight=False,
                health_metric_sleep=False,
                health_metric_vo2_max=False,
                health_metric_active_energy=False,
            ),
            db,
        )

    assert result is not None
    assert "52" in result
    assert "Resting HR" in result


@pytest.mark.anyio
async def test_health_block_omits_disabled_metrics(db_session):
    today = datetime.date.today()
    async with db_session() as db:
        await _insert(
            db,
            today - datetime.timedelta(days=1),
            resting_hr_bpm=55.0,
            hrv_sdnn_ms=68.0,
            weight_kg=70.0,
        )
        result = await get_health_context_block(
            _settings(health_metric_weight=False, health_metric_sleep=False,
                      health_metric_vo2_max=False, health_metric_active_energy=False),
            db,
        )

    assert result is not None
    assert "Resting HR" in result
    assert "HRV" in result
    assert "Weight" not in result


@pytest.mark.anyio
async def test_health_block_averages_multiple_days(db_session):
    today = datetime.date.today()
    async with db_session() as db:
        await _insert(db, today - datetime.timedelta(days=1), resting_hr_bpm=50.0)
        await _insert(db, today - datetime.timedelta(days=2), resting_hr_bpm=60.0)
        result = await get_health_context_block(
            _settings(health_metric_hrv=False, health_metric_weight=False,
                      health_metric_sleep=False, health_metric_vo2_max=False,
                      health_metric_active_energy=False),
            db,
        )

    assert result is not None
    assert "55" in result  # average of 50 and 60


@pytest.mark.anyio
async def test_health_block_sleep_shown_in_hours(db_session):
    today = datetime.date.today()
    async with db_session() as db:
        await _insert(db, today - datetime.timedelta(days=1), sleep_duration_seconds=25200)  # 7h
        result = await get_health_context_block(
            _settings(health_metric_resting_hr=False, health_metric_hrv=False,
                      health_metric_weight=False, health_metric_vo2_max=False,
                      health_metric_active_energy=False),
            db,
        )

    assert result is not None
    assert "7.0" in result
    assert "Sleep (h)" in result


@pytest.mark.anyio
async def test_health_block_historical_windows(db_session):
    today = datetime.date.today()
    async with db_session() as db:
        # Insert data in each historical window
        await _insert(db, today - datetime.timedelta(days=30), resting_hr_bpm=58.0)   # ~1mo ago
        await _insert(db, today - datetime.timedelta(days=93), resting_hr_bpm=62.0)   # ~3mo ago
        await _insert(db, today - datetime.timedelta(days=365), resting_hr_bpm=66.0)  # ~1yr ago
        result = await get_health_context_block(
            _settings(health_metric_hrv=False, health_metric_weight=False,
                      health_metric_sleep=False, health_metric_vo2_max=False,
                      health_metric_active_energy=False),
            db,
        )

    assert result is not None
    assert "58" in result
    assert "62" in result
    assert "66" in result


# ── Health block appears in AI prompt ─────────────────────────────────────────


def _fake_anthropic_response(text: str = "ok"):
    usage = SimpleNamespace(input_tokens=10, output_tokens=5)
    return SimpleNamespace(content=[SimpleNamespace(text=text)], usage=usage)


@pytest.mark.anyio
async def test_health_block_absent_from_prompt_when_no_data(
    db_session, auth_client: AsyncClient
):
    """No body_metrics rows → health block must not appear in the prompt."""
    await auth_client.patch(
        "/api/profile",
        json={"ai_key": "sk-ant-fake-key", "ai_provider": "anthropic"},
    )

    captured: list[str] = []

    def _capture(**kwargs):
        msgs = kwargs.get("messages", [])
        if msgs:
            content = msgs[0].get("content", [])
            if content:
                captured.append(content[0].get("text", ""))
        return _fake_anthropic_response()

    with patch("anthropic.Anthropic") as MockAnthropic:
        instance = MagicMock()
        instance.messages.create.side_effect = _capture
        MockAnthropic.return_value = instance
        resp = await auth_client.post("/api/ai/weekly-insights")

    assert resp.status_code == 200
    assert captured
    assert "Health metrics" not in captured[0]


@pytest.mark.anyio
async def test_health_block_present_in_prompt_when_data_exists(
    db_session, auth_client: AsyncClient
):
    """body_metrics row in the Now window → health block appears in the prompt."""
    today = datetime.date.today()
    async with db_session() as db:
        await _insert(db, today - datetime.timedelta(days=1), resting_hr_bpm=60.0)

    await auth_client.patch(
        "/api/profile",
        json={"ai_key": "sk-ant-fake-key", "ai_provider": "anthropic"},
    )

    captured: list[str] = []

    def _capture(**kwargs):
        msgs = kwargs.get("messages", [])
        if msgs:
            content = msgs[0].get("content", [])
            if content:
                captured.append(content[0].get("text", ""))
        return _fake_anthropic_response()

    with patch("anthropic.Anthropic") as MockAnthropic:
        instance = MagicMock()
        instance.messages.create.side_effect = _capture
        MockAnthropic.return_value = instance
        resp = await auth_client.post("/api/ai/weekly-insights")

    assert resp.status_code == 200
    assert captured
    assert "Health metrics" in captured[0]
    assert "Resting HR" in captured[0]
    assert "60" in captured[0]
