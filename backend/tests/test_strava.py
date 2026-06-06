"""Tests for Strava OAuth helpers, token encryption, activity mapping, and API endpoints (task group 11.1)."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.config import settings
from app.models.cardio_activity_type import CardioActivityType
from app.services import crypto
from app.services.strava_service import _build_segment, map_strava_type
from tests.conftest import TEST_USERNAME


# ── Token encryption round-trip ───────────────────────────────────────────────


def test_crypto_encrypt_produces_ciphertext():
    plaintext = "strava-access-token-abc123"
    encrypted = crypto.encrypt(plaintext)
    assert encrypted != plaintext


def test_crypto_round_trip_access_token():
    plaintext = "strava-access-token-abc123"
    assert crypto.decrypt(crypto.encrypt(plaintext)) == plaintext


def test_crypto_round_trip_refresh_token():
    token = "a-refresh-token-with-special-chars-xyz789"
    assert crypto.decrypt(crypto.encrypt(token)) == token


# ── _build_segment (lap → segment) ───────────────────────────────────────────


def test_build_segment_computes_pace():
    lap = {"distance": 5000.0, "elapsed_time": 1500}
    seg = _build_segment(lap, "Run")
    assert seg["distance_m"] == 5000.0
    assert seg["duration_seconds"] == 1500
    assert seg["activity_type"] == "Run"
    assert seg["pace_s_per_km"] == pytest.approx(300.0)  # 1500s / 5km = 300 s/km


def test_build_segment_zero_distance_gives_no_pace():
    seg = _build_segment({"distance": 0.0, "elapsed_time": 600}, None)
    assert seg["pace_s_per_km"] is None
    assert seg["distance_m"] == 0.0
    assert seg["duration_seconds"] == 600
    assert seg["activity_type"] is None


def test_build_segment_missing_fields_defaults_to_zero():
    seg = _build_segment({}, "Run")
    assert seg["distance_m"] == 0.0
    assert seg["duration_seconds"] == 0
    assert seg["pace_s_per_km"] is None


def test_build_segment_multi_lap_payload():
    """Simulate three laps from a Strava response and verify segment list."""
    laps = [
        {"distance": 1000.0, "elapsed_time": 300},
        {"distance": 1000.0, "elapsed_time": 310},
        {"distance": 500.0, "elapsed_time": 160},
    ]
    segments = [_build_segment(lap, "Run") for lap in laps]
    assert len(segments) == 3
    assert segments[0]["pace_s_per_km"] == pytest.approx(300.0)
    assert segments[2]["distance_m"] == 500.0


# ── Activity type mapping ─────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_map_strength_type_weighttraining(db_session):
    async with db_session() as db:
        result = await map_strava_type("WeightTraining", db, TEST_USERNAME)
    assert result["session_type"] == "strength"
    assert result["activity_type_name"] is None
    assert result["proposed_type_name"] is None


@pytest.mark.anyio
async def test_map_strength_type_functional(db_session):
    async with db_session() as db:
        result = await map_strava_type("FunctionalStrengthTraining", db, TEST_USERNAME)
    assert result["session_type"] == "strength"


@pytest.mark.anyio
async def test_map_strength_type_case_insensitive(db_session):
    async with db_session() as db:
        result = await map_strava_type("YOGA", db, TEST_USERNAME)
    assert result["session_type"] == "strength"


@pytest.mark.anyio
async def test_map_cardio_alias_ride_to_cycle(db_session):
    async with db_session() as db:
        db.add(CardioActivityType(user_id=TEST_USERNAME, name="Cycle"))
        await db.commit()
        result = await map_strava_type("Ride", db, TEST_USERNAME)
    assert result["session_type"] == "cardio"
    assert result["activity_type_name"] == "Cycle"
    assert result["proposed_type_name"] is None


@pytest.mark.anyio
async def test_map_direct_match_run(db_session):
    async with db_session() as db:
        db.add(CardioActivityType(user_id=TEST_USERNAME, name="Run"))
        await db.commit()
        result = await map_strava_type("Run", db, TEST_USERNAME)
    assert result["session_type"] == "cardio"
    assert result["activity_type_name"] == "Run"
    assert result["proposed_type_name"] is None


@pytest.mark.anyio
async def test_map_unknown_type_proposes_name(db_session):
    async with db_session() as db:
        result = await map_strava_type("Snowboard", db, TEST_USERNAME)
    assert result["session_type"] == "cardio"
    assert result["activity_type_name"] is None
    assert result["proposed_type_name"] == "Snowboard"


@pytest.mark.anyio
async def test_map_virtualride_alias_when_cycle_exists(db_session):
    async with db_session() as db:
        db.add(CardioActivityType(user_id=TEST_USERNAME, name="Cycle"))
        await db.commit()
        result = await map_strava_type("VirtualRide", db, TEST_USERNAME)
    assert result["session_type"] == "cardio"
    assert result["activity_type_name"] == "Cycle"


@pytest.mark.anyio
async def test_map_unknown_type_when_no_activity_types_exist(db_session):
    """No activity types in DB → unknown type should propose its name."""
    async with db_session() as db:
        result = await map_strava_type("Walk", db, TEST_USERNAME)
    assert result["activity_type_name"] is None
    assert result["proposed_type_name"] == "Walk"


# ── API: GET /strava/auth-url ─────────────────────────────────────────────────


@pytest.mark.anyio
async def test_auth_url_returns_strava_url(monkeypatch, db_session, auth_client: AsyncClient):
    monkeypatch.setattr(settings, "strava_client_id", "test-client-id")
    monkeypatch.setattr(settings, "strava_client_secret", "test-secret")
    monkeypatch.setattr(settings, "strava_redirect_uri", "http://localhost:8000/api/strava/callback")
    resp = await auth_client.get("/api/strava/auth-url")
    assert resp.status_code == 200
    url = resp.json()["url"]
    assert "strava.com" in url
    assert "read_all" in url  # scope=activity%3Aread_all (URL-encoded)


@pytest.mark.anyio
async def test_auth_url_503_when_not_configured(monkeypatch, db_session, auth_client: AsyncClient):
    monkeypatch.setattr(settings, "strava_client_id", None)
    monkeypatch.setattr(settings, "strava_client_secret", None)
    monkeypatch.setattr(settings, "strava_redirect_uri", None)
    resp = await auth_client.get("/api/strava/auth-url")
    assert resp.status_code == 503


# ── API: POST /strava/fetch ───────────────────────────────────────────────────


@pytest.mark.anyio
async def test_fetch_503_when_strava_not_configured(monkeypatch, db_session, auth_client: AsyncClient):
    monkeypatch.setattr(settings, "strava_client_id", None)
    monkeypatch.setattr(settings, "strava_client_secret", None)
    monkeypatch.setattr(settings, "strava_redirect_uri", None)
    resp = await auth_client.post("/api/strava/fetch")
    assert resp.status_code == 503


@pytest.mark.anyio
async def test_fetch_400_when_strava_configured_but_not_connected(
    monkeypatch, db_session, auth_client: AsyncClient
):
    monkeypatch.setattr(settings, "strava_client_id", "test-id")
    monkeypatch.setattr(settings, "strava_client_secret", "test-secret")
    monkeypatch.setattr(settings, "strava_redirect_uri", "http://localhost/callback")
    # User has Strava configured but no access token stored
    resp = await auth_client.post("/api/strava/fetch")
    assert resp.status_code == 400
