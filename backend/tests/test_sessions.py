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


# ── Strength session tests ─────────────────────────────────────────────────────

async def _create_exercise(client, name: str = "Bench Press") -> int:
    resp = await client.post("/api/exercises", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


STRENGTH_PAYLOAD_FACTORY = lambda ex_id: {
    "date": "2026-05-04",
    "notes": "Morning lift",
    "exercises": [
        {
            "exercise_id": ex_id,
            "order": 1,
            "sets": [
                {"set_number": 1, "reps": 10, "weight": 60.0},
                {"set_number": 2, "reps": 8, "weight": 65.0},
                {"set_number": 3, "reps": 6, "weight": 70.0},
            ],
        }
    ],
}


@pytest.mark.asyncio
async def test_create_strength_session(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    payload = STRENGTH_PAYLOAD_FACTORY(ex_id)

    resp = await auth_client.post("/api/sessions/strength", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["type"] == "strength"
    assert data["date"] == "2026-05-04"
    assert data["notes"] == "Morning lift"
    assert len(data["exercises"]) == 1
    assert len(data["exercises"][0]["sets"]) == 3
    assert data["exercises"][0]["sets"][0]["reps"] == 10
    assert data["exercises"][0]["sets"][2]["weight"] == 70.0


@pytest.mark.asyncio
async def test_create_strength_session_multiple_exercises(db_session, auth_client: AsyncClient):
    ex1_id = await _create_exercise(auth_client, "Squat")
    ex2_id = await _create_exercise(auth_client, "Deadlift")
    payload = {
        "date": "2026-05-04",
        "notes": None,
        "exercises": [
            {
                "exercise_id": ex1_id,
                "order": 1,
                "sets": [
                    {"set_number": 1, "reps": 5, "weight": 100.0},
                    {"set_number": 2, "reps": 5, "weight": 100.0},
                ],
            },
            {
                "exercise_id": ex2_id,
                "order": 2,
                "sets": [
                    {"set_number": 1, "reps": 3, "weight": 120.0},
                ],
            },
        ],
    }
    resp = await auth_client.post("/api/sessions/strength", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["exercises"]) == 2
    assert data["exercises"][0]["order"] == 1
    assert len(data["exercises"][0]["sets"]) == 2
    assert data["exercises"][1]["order"] == 2
    assert len(data["exercises"][1]["sets"]) == 1


@pytest.mark.asyncio
async def test_get_strength_session(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    create = await auth_client.post("/api/sessions/strength", json=STRENGTH_PAYLOAD_FACTORY(ex_id))
    session_id = create.json()["id"]

    resp = await auth_client.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == session_id
    assert data["type"] == "strength"
    assert len(data["exercises"]) == 1
    assert data["exercises"][0]["exercise_name"] == "Bench Press"


@pytest.mark.asyncio
async def test_patch_strength_session(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    create = await auth_client.post("/api/sessions/strength", json=STRENGTH_PAYLOAD_FACTORY(ex_id))
    session_id = create.json()["id"]

    patch_resp = await auth_client.patch(
        f"/api/sessions/{session_id}",
        json={
            "notes": "Updated",
            "exercises": [
                {
                    "exercise_id": ex_id,
                    "order": 1,
                    "sets": [
                        {"set_number": 1, "reps": 12, "weight": 55.0},
                    ],
                }
            ],
        },
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["notes"] == "Updated"
    assert len(data["exercises"][0]["sets"]) == 1
    assert data["exercises"][0]["sets"][0]["reps"] == 12


@pytest.mark.asyncio
async def test_delete_strength_session(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    create = await auth_client.post("/api/sessions/strength", json=STRENGTH_PAYLOAD_FACTORY(ex_id))
    session_id = create.json()["id"]

    delete_resp = await auth_client.delete(f"/api/sessions/{session_id}")
    assert delete_resp.status_code == 204

    get_resp = await auth_client.get(f"/api/sessions/{session_id}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_strength_session_requires_auth(db_session, client: AsyncClient, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    resp = await client.post("/api/sessions/strength", json=STRENGTH_PAYLOAD_FACTORY(ex_id))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_strength_session_user_isolation(db_session, auth_client: AsyncClient, auth_client_2: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    create = await auth_client.post("/api/sessions/strength", json=STRENGTH_PAYLOAD_FACTORY(ex_id))
    session_id = create.json()["id"]

    resp = await auth_client_2.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 404

    resp = await auth_client_2.delete(f"/api/sessions/{session_id}")
    assert resp.status_code == 404
