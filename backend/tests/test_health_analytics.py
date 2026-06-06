"""Tests for GET /analytics/health-metrics endpoint (task group 11.4)."""
from __future__ import annotations

import datetime

import pytest
from httpx import AsyncClient

from app.models.body_metrics import BodyMetrics
from app.models.user_settings import UserSettings
from tests.conftest import TEST_USERNAME


async def _insert(db, date: datetime.date, **values) -> None:
    db.add(BodyMetrics(date=date, **values))
    await db.commit()


# ── Basic list behaviour ───────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_health_metrics_empty_list(db_session, auth_client: AsyncClient):
    resp = await auth_client.get("/api/analytics/health-metrics?days=90")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.anyio
async def test_health_metrics_returns_rows_in_period(db_session, auth_client: AsyncClient):
    today = datetime.date.today()
    async with db_session() as db:
        await _insert(db, today - datetime.timedelta(days=5), resting_hr_bpm=55.0)
        await _insert(db, today - datetime.timedelta(days=10), resting_hr_bpm=58.0)
        # Outside the 90-day window — must not appear
        await _insert(db, today - datetime.timedelta(days=100), resting_hr_bpm=60.0)

    resp = await auth_client.get("/api/analytics/health-metrics?days=90")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    dates = {row["date"] for row in data}
    assert str(today - datetime.timedelta(days=5)) in dates
    assert str(today - datetime.timedelta(days=10)) in dates


@pytest.mark.anyio
async def test_health_metrics_days_zero_returns_all_time(db_session, auth_client: AsyncClient):
    today = datetime.date.today()
    async with db_session() as db:
        await _insert(db, today - datetime.timedelta(days=365), resting_hr_bpm=65.0)
        await _insert(db, today - datetime.timedelta(days=5), resting_hr_bpm=52.0)

    resp = await auth_client.get("/api/analytics/health-metrics?days=0")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.anyio
async def test_health_metrics_ordered_by_date(db_session, auth_client: AsyncClient):
    today = datetime.date.today()
    async with db_session() as db:
        await _insert(db, today - datetime.timedelta(days=3), resting_hr_bpm=56.0)
        await _insert(db, today - datetime.timedelta(days=7), resting_hr_bpm=60.0)
        await _insert(db, today - datetime.timedelta(days=1), resting_hr_bpm=52.0)

    resp = await auth_client.get("/api/analytics/health-metrics?days=90")
    data = resp.json()
    dates = [row["date"] for row in data]
    assert dates == sorted(dates)


# ── Null handling ─────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_health_metrics_nulls_preserved_not_coerced_to_zero(
    db_session, auth_client: AsyncClient
):
    """Columns not set on a row must come back as null, never 0."""
    today = datetime.date.today()
    async with db_session() as db:
        # Create UserSettings with all metrics explicitly enabled (server_default
        # does not apply to Python-level objects, so we set them explicitly).
        db.add(UserSettings(
            username=TEST_USERNAME,
            health_metric_resting_hr=True,
            health_metric_hrv=True,
            health_metric_weight=True,
            health_metric_sleep=True,
            health_metric_vo2_max=True,
            health_metric_active_energy=True,
        ))
        await db.commit()
        # Only resting_hr_bpm is set; every other column stays null.
        await _insert(db, today - datetime.timedelta(days=1), resting_hr_bpm=52.0)

    resp = await auth_client.get("/api/analytics/health-metrics?days=90")
    row = resp.json()[0]
    assert row["resting_hr_bpm"] == pytest.approx(52.0)
    assert row["hrv_sdnn_ms"] is None
    assert row["weight_kg"] is None
    assert row["sleep_duration_seconds"] is None
    assert row["vo2_max"] is None
    assert row["active_energy_kcal"] is None


@pytest.mark.anyio
async def test_health_metrics_all_columns_populated(db_session, auth_client: AsyncClient):
    today = datetime.date.today()
    async with db_session() as db:
        db.add(UserSettings(
            username=TEST_USERNAME,
            health_metric_resting_hr=True,
            health_metric_hrv=True,
            health_metric_weight=True,
            health_metric_sleep=True,
            health_metric_vo2_max=True,
            health_metric_active_energy=True,
        ))
        await db.commit()
        await _insert(
            db,
            today - datetime.timedelta(days=1),
            resting_hr_bpm=52.0,
            hrv_sdnn_ms=68.5,
            weight_kg=70.2,
            sleep_duration_seconds=25200,
            vo2_max=55.0,
            active_energy_kcal=420.0,
        )

    resp = await auth_client.get("/api/analytics/health-metrics?days=90")
    row = resp.json()[0]
    assert row["resting_hr_bpm"] == pytest.approx(52.0)
    assert row["hrv_sdnn_ms"] == pytest.approx(68.5)
    assert row["weight_kg"] == pytest.approx(70.2)
    assert row["sleep_duration_seconds"] == 25200
    assert row["vo2_max"] == pytest.approx(55.0)
    assert row["active_energy_kcal"] == pytest.approx(420.0)


# ── Metric preference gating ──────────────────────────────────────────────────


@pytest.mark.anyio
async def test_health_metrics_disabled_metric_returns_null(db_session, auth_client: AsyncClient):
    """A metric disabled in user preferences must come back null even when data exists."""
    today = datetime.date.today()
    async with db_session() as db:
        db.add(UserSettings(username=TEST_USERNAME, health_metric_resting_hr=False))
        await db.commit()
        await _insert(db, today - datetime.timedelta(days=1), resting_hr_bpm=55.0, hrv_sdnn_ms=65.0)

    resp = await auth_client.get("/api/analytics/health-metrics?days=90")
    row = resp.json()[0]
    assert row["resting_hr_bpm"] is None    # disabled → null
    assert row["hrv_sdnn_ms"] == pytest.approx(65.0)  # enabled → real value


@pytest.mark.anyio
async def test_health_metrics_all_prefs_disabled_still_returns_rows(
    db_session, auth_client: AsyncClient
):
    """Disabled prefs null out values but rows are still returned (date preserved)."""
    today = datetime.date.today()
    async with db_session() as db:
        db.add(UserSettings(
            username=TEST_USERNAME,
            health_metric_resting_hr=False,
            health_metric_hrv=False,
            health_metric_weight=False,
            health_metric_sleep=False,
            health_metric_vo2_max=False,
            health_metric_active_energy=False,
        ))
        await db.commit()
        await _insert(db, today - datetime.timedelta(days=1), resting_hr_bpm=55.0)

    resp = await auth_client.get("/api/analytics/health-metrics?days=90")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["resting_hr_bpm"] is None
