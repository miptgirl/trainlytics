import pytest
from httpx import AsyncClient


CARDIO_PAYLOAD = {
    "activity_type_id": None,
    "total_duration_seconds": 3600,
    "date": "2026-05-01T07:00:00Z",
    "notes": "Morning run",
    "title": "Morning 10k",
    "calories": 400,
    "segments": [
        {
            "order": 1,
            "duration_seconds": 1800,
            "distance_meters": 5000.0,
            "pace_seconds_per_km": 360.0,
            "heart_rate_avg": 145,
            "title": "Warm-up",
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
    assert data["date"].startswith("2026-05-01")
    assert data["notes"] == "Morning run"
    assert data["title"] == "Morning 10k"
    assert data["calories"] == 400
    assert data["total_duration_seconds"] == 3600
    assert len(data["segments"]) == 2
    assert data["segments"][0]["order"] == 1
    assert data["segments"][0]["title"] == "Warm-up"
    assert data["segments"][1]["order"] == 2
    assert data["segments"][1]["title"] is None


@pytest.mark.asyncio
async def test_create_cardio_session_single_segment(db_session, auth_client: AsyncClient):
    payload = {
        "date": "2026-05-02T08:30:00Z",
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
    assert data["title"] is None
    assert data["calories"] is None


@pytest.mark.asyncio
async def test_get_cardio_session(db_session, auth_client: AsyncClient):
    create = await auth_client.post("/api/sessions/cardio", json=CARDIO_PAYLOAD)
    session_id = create.json()["id"]

    resp = await auth_client.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == session_id
    assert len(data["segments"]) == 2
    assert data["title"] == "Morning 10k"
    assert data["calories"] == 400
    assert data["segments"][0]["title"] == "Warm-up"


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
            "title": "Evening run",
            "calories": 500,
            "segments": [{"order": 1, "duration_seconds": 2400, "distance_meters": 8000.0}],
        },
    )
    assert patch.status_code == 200
    data = patch.json()
    assert data["notes"] == "Updated notes"
    assert data["title"] == "Evening run"
    assert data["calories"] == 500
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

    resp = await auth_client_2.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 404

    resp = await auth_client_2.delete(f"/api/sessions/{session_id}")
    assert resp.status_code == 404


# ── Strength session tests ─────────────────────────────────────────────────────

async def _create_exercise(client, name: str = "Bench Press") -> int:
    resp = await client.post("/api/exercises", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


STRENGTH_PAYLOAD_FACTORY = lambda ex_id: {
    "date": "2026-05-04T06:00:00Z",
    "notes": "Morning lift",
    "title": "Push day",
    "calories": 350,
    "duration_seconds": 3600,
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
    assert data["date"].startswith("2026-05-04")
    assert data["notes"] == "Morning lift"
    assert data["title"] == "Push day"
    assert data["calories"] == 350
    assert data["duration_seconds"] == 3600
    assert len(data["exercises"]) == 1
    assert len(data["exercises"][0]["sets"]) == 3
    assert data["exercises"][0]["sets"][0]["reps"] == 10
    assert data["exercises"][0]["sets"][2]["weight"] == 70.0


@pytest.mark.asyncio
async def test_create_strength_session_multiple_exercises(db_session, auth_client: AsyncClient):
    ex1_id = await _create_exercise(auth_client, "Squat")
    ex2_id = await _create_exercise(auth_client, "Deadlift")
    payload = {
        "date": "2026-05-04T09:00:00Z",
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
    assert data["title"] == "Push day"
    assert data["calories"] == 350
    assert data["duration_seconds"] == 3600
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
            "title": "Pull day",
            "calories": 300,
            "duration_seconds": 2700,
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
    assert data["title"] == "Pull day"
    assert data["calories"] == 300
    assert data["duration_seconds"] == 2700
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


# ── history list ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_sessions_empty(db_session, auth_client: AsyncClient):
    resp = await auth_client.get("/api/sessions")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_sessions_returns_both_types(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    await auth_client.post("/api/sessions/cardio", json=CARDIO_PAYLOAD)
    await auth_client.post("/api/sessions/strength", json=STRENGTH_PAYLOAD_FACTORY(ex_id))

    resp = await auth_client.get("/api/sessions")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    types = {s["type"] for s in data["items"]}
    assert types == {"cardio", "strength"}


@pytest.mark.asyncio
async def test_list_sessions_filter_by_type(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    await auth_client.post("/api/sessions/cardio", json=CARDIO_PAYLOAD)
    await auth_client.post("/api/sessions/strength", json=STRENGTH_PAYLOAD_FACTORY(ex_id))

    resp = await auth_client.get("/api/sessions?type=cardio")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["type"] == "cardio"

    resp2 = await auth_client.get("/api/sessions?type=strength")
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["total"] == 1
    assert data2["items"][0]["type"] == "strength"


@pytest.mark.asyncio
async def test_list_sessions_filter_by_date_range(db_session, auth_client: AsyncClient):
    payload_early = {**CARDIO_PAYLOAD, "date": "2026-01-01T00:00:00Z"}
    payload_late = {**CARDIO_PAYLOAD, "date": "2026-06-01T00:00:00Z"}
    await auth_client.post("/api/sessions/cardio", json=payload_early)
    await auth_client.post("/api/sessions/cardio", json=payload_late)

    resp = await auth_client.get("/api/sessions?date_from=2026-05-01T00:00:00Z&date_to=2026-12-31T23:59:59Z")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["date"].startswith("2026-06-01")


@pytest.mark.asyncio
async def test_list_sessions_summary_metrics(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    await auth_client.post("/api/sessions/cardio", json=CARDIO_PAYLOAD)
    await auth_client.post("/api/sessions/strength", json=STRENGTH_PAYLOAD_FACTORY(ex_id))

    resp = await auth_client.get("/api/sessions")
    assert resp.status_code == 200
    items = resp.json()["items"]
    cardio_item = next(s for s in items if s["type"] == "cardio")
    strength_item = next(s for s in items if s["type"] == "strength")
    assert cardio_item["total_duration_seconds"] == 3600
    assert cardio_item["title"] == "Morning 10k"
    assert cardio_item["calories"] == 400
    assert strength_item["total_sets"] == 3
    assert strength_item["title"] == "Push day"
    assert strength_item["calories"] == 350
    assert strength_item["duration_seconds"] == 3600


@pytest.mark.asyncio
async def test_list_sessions_user_isolation(db_session, auth_client: AsyncClient, auth_client_2: AsyncClient):
    await auth_client.post("/api/sessions/cardio", json=CARDIO_PAYLOAD)

    resp = await auth_client_2.get("/api/sessions")
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_list_sessions_pagination(db_session, auth_client: AsyncClient):
    for i in range(5):
        await auth_client.post("/api/sessions/cardio", json={**CARDIO_PAYLOAD, "date": f"2026-0{i+1}-01T00:00:00Z"})

    resp = await auth_client.get("/api/sessions?page=1&page_size=3")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 3

    resp2 = await auth_client.get("/api/sessions?page=2&page_size=3")
    assert len(resp2.json()["items"]) == 2


@pytest.mark.asyncio
async def test_list_sessions_reverse_chronological(db_session, auth_client: AsyncClient):
    await auth_client.post("/api/sessions/cardio", json={**CARDIO_PAYLOAD, "date": "2026-01-01T00:00:00Z"})
    await auth_client.post("/api/sessions/cardio", json={**CARDIO_PAYLOAD, "date": "2026-06-01T00:00:00Z"})

    resp = await auth_client.get("/api/sessions")
    data = resp.json()
    assert data["items"][0]["date"].startswith("2026-06-01")
    assert data["items"][1]["date"].startswith("2026-01-01")


# ── weekly summary ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_weekly_summary_empty(db_session, auth_client: AsyncClient):
    resp = await auth_client.get("/api/sessions/weekly-summary?week_start=2026-05-04")
    assert resp.status_code == 200
    data = resp.json()
    assert data == {
        "cardio": {"minutes": 0, "calories": 0},
        "strength": {"minutes": 0, "calories": 0},
    }


@pytest.mark.asyncio
async def test_weekly_summary_aggregates_correctly(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    # Cardio: Mon 2026-05-04, 3600s = 60 mins, 400 cal
    await auth_client.post("/api/sessions/cardio", json={**CARDIO_PAYLOAD, "date": "2026-05-04T07:00:00Z"})
    # Strength: Tue 2026-05-05, 3600s = 60 mins, 350 cal
    strength_payload = STRENGTH_PAYLOAD_FACTORY(ex_id)
    await auth_client.post("/api/sessions/strength", json={**strength_payload, "date": "2026-05-05T07:00:00Z"})

    resp = await auth_client.get("/api/sessions/weekly-summary?week_start=2026-05-04")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cardio"]["minutes"] == 60
    assert data["cardio"]["calories"] == 400
    assert data["strength"]["minutes"] == 60
    assert data["strength"]["calories"] == 350


@pytest.mark.asyncio
async def test_weekly_summary_excludes_outside_week(db_session, auth_client: AsyncClient):
    # Session from the previous week (Sun 2026-04-26)
    await auth_client.post("/api/sessions/cardio", json={**CARDIO_PAYLOAD, "date": "2026-04-26T07:00:00Z"})
    # Session from next week (Mon 2026-05-11)
    await auth_client.post("/api/sessions/cardio", json={**CARDIO_PAYLOAD, "date": "2026-05-11T07:00:00Z"})

    resp = await auth_client.get("/api/sessions/weekly-summary?week_start=2026-05-04")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cardio"]["minutes"] == 0


@pytest.mark.asyncio
async def test_weekly_summary_ignores_null_calories(db_session, auth_client: AsyncClient):
    # Session with no calories
    no_cal_payload = {**CARDIO_PAYLOAD, "date": "2026-05-04T07:00:00Z", "calories": None}
    await auth_client.post("/api/sessions/cardio", json=no_cal_payload)

    resp = await auth_client.get("/api/sessions/weekly-summary?week_start=2026-05-04")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cardio"]["calories"] == 0
    assert data["cardio"]["minutes"] == 60


@pytest.mark.asyncio
async def test_weekly_summary_user_isolation(db_session, auth_client: AsyncClient, auth_client_2: AsyncClient):
    await auth_client.post("/api/sessions/cardio", json={**CARDIO_PAYLOAD, "date": "2026-05-04T07:00:00Z"})

    resp = await auth_client_2.get("/api/sessions/weekly-summary?week_start=2026-05-04")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cardio"]["minutes"] == 0
    assert data["cardio"]["calories"] == 0


# ── training trends ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_training_trends_returns_n_weeks(db_session, auth_client: AsyncClient):
    resp = await auth_client.get("/api/sessions/training-trends?weeks=12")
    assert resp.status_code == 200
    data = resp.json()
    # API returns the last N full weeks + the current in-progress week = N+1
    assert len(data) == 13


@pytest.mark.asyncio
async def test_training_trends_empty_weeks_are_zeros(db_session, auth_client: AsyncClient):
    resp = await auth_client.get("/api/sessions/training-trends?weeks=4")
    assert resp.status_code == 200
    data = resp.json()
    for point in data:
        assert point["cardio_minutes"] == 0
        assert point["strength_minutes"] == 0
        assert point["cardio_calories"] == 0
        assert point["strength_calories"] == 0


@pytest.mark.asyncio
async def test_training_trends_ordered_chronologically(db_session, auth_client: AsyncClient):
    resp = await auth_client.get("/api/sessions/training-trends?weeks=4")
    assert resp.status_code == 200
    data = resp.json()
    week_starts = [p["week_start"] for p in data]
    assert week_starts == sorted(week_starts)


@pytest.mark.asyncio
async def test_training_trends_user_isolation(
    db_session, auth_client: AsyncClient, auth_client_2: AsyncClient
):
    from datetime import date, timedelta

    today = date.today()
    last_monday = today - timedelta(days=today.weekday()) - timedelta(weeks=1)
    session_date = f"{last_monday.isoformat()}T07:00:00Z"

    await auth_client.post("/api/sessions/cardio", json={**CARDIO_PAYLOAD, "date": session_date})

    resp = await auth_client_2.get("/api/sessions/training-trends?weeks=4")
    assert resp.status_code == 200
    data = resp.json()
    assert all(p["cardio_minutes"] == 0 for p in data)
