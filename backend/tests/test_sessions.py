import pytest
from httpx import AsyncClient


CARDIO_PAYLOAD = {
    "activity_type_id": None,
    "total_duration_seconds": 3600,
    "date": "2026-05-01",
    "notes": "Morning run",
    "segments": [
        {
            "order": 1,
            "duration_seconds": 1800,
            "distance_meters": 5000.0,
            "pace_seconds_per_km": 360.0,
            "heart_rate_avg": 145,
        },
        {
            "order": 2,
            "duration_seconds": 1800,
            "distance_meters": 5000.0,
            "pace_seconds_per_km": 360.0,
            "heart_rate_avg": 155,
        },
    ],
}


@pytest.mark.asyncio
async def test_create_cardio_session(db_session, auth_client: AsyncClient):
    resp = await auth_client.post("/api/sessions/cardio", json=CARDIO_PAYLOAD)
    assert resp.status_code == 201
    data = resp.json()
    assert data["date"] == "2026-05-01"
    assert data["notes"] == "Morning run"
    assert data["total_duration_seconds"] == 3600
    assert len(data["segments"]) == 2
    assert data["segments"][0]["order"] == 1
    assert data["segments"][1]["order"] == 2


@pytest.mark.asyncio
async def test_create_cardio_session_single_segment(db_session, auth_client: AsyncClient):
    payload = {
        "date": "2026-05-02",
        "notes": None,
        "segments": [
            {"order": 1, "duration_seconds": 1800},
        ],
    }
    resp = await auth_client.post("/api/sessions/cardio", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["segments"]) == 1
    assert data["segments"][0]["distance_meters"] is None
    assert data["segments"][0]["heart_rate_avg"] is None


@pytest.mark.asyncio
async def test_get_cardio_session(db_session, auth_client: AsyncClient):
    create = await auth_client.post("/api/sessions/cardio", json=CARDIO_PAYLOAD)
    session_id = create.json()["id"]

    resp = await auth_client.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == session_id
    assert len(data["segments"]) == 2


@pytest.mark.asyncio
async def test_get_session_not_found(db_session, auth_client: AsyncClient):
    resp = await auth_client.get("/api/sessions/9999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_cardio_session(db_session, auth_client: AsyncClient):
    create = await auth_client.post("/api/sessions/cardio", json=CARDIO_PAYLOAD)
    session_id = create.json()["id"]

    patch = await auth_client.patch(
        f"/api/sessions/{session_id}",
        json={
            "notes": "Updated notes",
            "segments": [{"order": 1, "duration_seconds": 2400, "distance_meters": 8000.0}],
        },
    )
    assert patch.status_code == 200
    data = patch.json()
    assert data["notes"] == "Updated notes"
    assert len(data["segments"]) == 1
    assert data["segments"][0]["duration_seconds"] == 2400


@pytest.mark.asyncio
async def test_delete_cardio_session(db_session, auth_client: AsyncClient):
    create = await auth_client.post("/api/sessions/cardio", json=CARDIO_PAYLOAD)
    session_id = create.json()["id"]

    delete = await auth_client.delete(f"/api/sessions/{session_id}")
    assert delete.status_code == 204

    get = await auth_client.get(f"/api/sessions/{session_id}")
    assert get.status_code == 404


@pytest.mark.asyncio
async def test_cardio_session_requires_auth(db_session, client: AsyncClient):
    resp = await client.post("/api/sessions/cardio", json=CARDIO_PAYLOAD)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_cardio_session_user_isolation(db_session, auth_client: AsyncClient, auth_client_2: AsyncClient):
    create = await auth_client.post("/api/sessions/cardio", json=CARDIO_PAYLOAD)
    session_id = create.json()["id"]

    # User 2 cannot read user 1's session
    resp = await auth_client_2.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 404

    # User 2 cannot delete user 1's session
    resp = await auth_client_2.delete(f"/api/sessions/{session_id}")
    assert resp.status_code == 404
