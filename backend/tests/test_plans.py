"""Tests for /plans endpoints (Group 5.1)."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import AsyncClient


def _monday_of_week(d: date) -> date:
    return d - timedelta(days=d.weekday())


TODAY = date.today()
THIS_MONDAY = _monday_of_week(TODAY)
PAST_MONDAY = THIS_MONDAY - timedelta(weeks=1)
FUTURE_MONDAY = THIS_MONDAY + timedelta(weeks=1)

# A date in the past (within last week)
PAST_DATE = PAST_MONDAY + timedelta(days=2)  # Wednesday of last week
# A date in the future (within next week)
FUTURE_DATE = FUTURE_MONDAY + timedelta(days=2)


async def _create_exercise(client: AsyncClient, name: str = "Bench Press") -> int:
    resp = await client.post("/api/exercises", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_template(client: AsyncClient, name: str = "Push Day") -> int:
    ex_id = await _create_exercise(client)
    payload = {
        "name": name,
        "exercises": [
            {
                "exercise_id": ex_id,
                "order": 1,
                "sets": [{"set_number": 1, "reps": 5, "weight_kg": 100.0}],
            }
        ],
    }
    resp = await client.post("/api/templates/strength", json=payload)
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_cardio_type(client: AsyncClient, name: str = "Run") -> int:
    resp = await client.post("/api/cardio-types", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


async def _log_strength_session(client: AsyncClient, on_date: date, template_id: int) -> dict:
    ex_id = await _create_exercise(client, f"Ex-{on_date}")
    payload = {
        "date": f"{on_date.isoformat()}T08:00:00Z",
        "template_id": template_id,
        "exercises": [
            {
                "exercise_id": ex_id,
                "order": 1,
                "sets": [{"set_number": 1, "reps": 5, "weight": 100.0}],
            }
        ],
    }
    resp = await client.post("/api/sessions/strength", json=payload)
    assert resp.status_code == 201
    return resp.json()


async def _log_cardio_session(client: AsyncClient, on_date: date, activity_type_id: int) -> dict:
    payload = {
        "date": f"{on_date.isoformat()}T08:00:00Z",
        "segments": [
            {
                "order": 1,
                "duration_seconds": 1800,
                "distance_meters": 5000.0,
                "pace_seconds_per_km": 360.0,
                "activity_type_id": activity_type_id,
            }
        ],
    }
    resp = await client.post("/api/sessions/cardio", json=payload)
    assert resp.status_code == 201
    return resp.json()


# ── GET /plans/{week_start} ───────────────────────────────────────────────────


async def test_get_plan_non_monday_returns_400(db_session, auth_client: AsyncClient):
    tuesday = (THIS_MONDAY + timedelta(days=1)).isoformat()
    resp = await auth_client.get(f"/api/plans/{tuesday}")
    assert resp.status_code == 400
    assert "Monday" in resp.json()["detail"]


async def test_get_plan_creates_empty_plan(db_session, auth_client: AsyncClient):
    resp = await auth_client.get(f"/api/plans/{THIS_MONDAY.isoformat()}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["week_start"] == THIS_MONDAY.isoformat()
    assert data["sessions"] == []
    assert "plan_id" in data


async def test_get_plan_second_call_returns_same_plan(db_session, auth_client: AsyncClient):
    r1 = await auth_client.get(f"/api/plans/{THIS_MONDAY.isoformat()}")
    r2 = await auth_client.get(f"/api/plans/{THIS_MONDAY.isoformat()}")
    assert r1.json()["plan_id"] == r2.json()["plan_id"]


async def test_planned_strength_session_status_done(db_session, auth_client: AsyncClient):
    tmpl_id = await _create_template(auth_client)
    on_date = THIS_MONDAY  # today or future — we just need a valid date in the week

    await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": on_date.isoformat(),
            "session_type": "strength",
            "template_id": tmpl_id,
        },
    )
    await _log_strength_session(auth_client, on_date, tmpl_id)

    resp = await auth_client.get(f"/api/plans/{THIS_MONDAY.isoformat()}")
    session = resp.json()["sessions"][0]
    assert session["status"] == "done"
    assert session["matched_session_id"] is not None


async def test_planned_session_past_date_no_log_is_skipped(db_session, auth_client: AsyncClient):
    tmpl_id = await _create_template(auth_client)
    await auth_client.post(
        f"/api/plans/{PAST_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": PAST_DATE.isoformat(),
            "session_type": "strength",
            "template_id": tmpl_id,
        },
    )

    resp = await auth_client.get(f"/api/plans/{PAST_MONDAY.isoformat()}")
    session = resp.json()["sessions"][0]
    assert session["status"] == "skipped"
    assert session["matched_session_id"] is None


async def test_planned_session_future_date_no_log_is_planned(db_session, auth_client: AsyncClient):
    tmpl_id = await _create_template(auth_client)
    await auth_client.post(
        f"/api/plans/{FUTURE_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": FUTURE_DATE.isoformat(),
            "session_type": "strength",
            "template_id": tmpl_id,
        },
    )

    resp = await auth_client.get(f"/api/plans/{FUTURE_MONDAY.isoformat()}")
    session = resp.json()["sessions"][0]
    assert session["status"] == "planned"
    assert session["matched_session_id"] is None


async def test_planned_cardio_matched_by_primary_activity_type(db_session, auth_client: AsyncClient):
    activity_id = await _create_cardio_type(auth_client)
    on_date = THIS_MONDAY

    await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": on_date.isoformat(),
            "session_type": "cardio",
            "segments": [
                {
                    "segment_order": 1,
                    "activity_type_id": activity_id,
                    "distance_metres": 8000,
                    "duration_secs": 3000,
                }
            ],
        },
    )
    await _log_cardio_session(auth_client, on_date, activity_id)

    resp = await auth_client.get(f"/api/plans/{THIS_MONDAY.isoformat()}")
    session = resp.json()["sessions"][0]
    assert session["status"] == "done"
    assert session["matched_session_id"] is not None


# ── POST /plans/{week_start}/sessions ────────────────────────────────────────


async def test_post_strength_without_template_id_returns_422(db_session, auth_client: AsyncClient):
    resp = await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": THIS_MONDAY.isoformat(),
            "session_type": "strength",
        },
    )
    assert resp.status_code == 422


async def test_post_cardio_without_segments_returns_422(db_session, auth_client: AsyncClient):
    resp = await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": THIS_MONDAY.isoformat(),
            "session_type": "cardio",
            "segments": [],
        },
    )
    assert resp.status_code == 422


async def test_post_strength_autofills_title_from_template(db_session, auth_client: AsyncClient):
    tmpl_id = await _create_template(auth_client, "Push Day")
    resp = await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": THIS_MONDAY.isoformat(),
            "session_type": "strength",
            "template_id": tmpl_id,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Push Day"
    assert data["template_id"] == tmpl_id


async def test_post_strength_custom_title_preserved(db_session, auth_client: AsyncClient):
    tmpl_id = await _create_template(auth_client)
    resp = await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": THIS_MONDAY.isoformat(),
            "session_type": "strength",
            "template_id": tmpl_id,
            "title": "My Custom Title",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["title"] == "My Custom Title"


async def test_post_cardio_with_segments(db_session, auth_client: AsyncClient):
    activity_id = await _create_cardio_type(auth_client)
    resp = await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": THIS_MONDAY.isoformat(),
            "session_type": "cardio",
            "segments": [
                {
                    "segment_order": 1,
                    "activity_type_id": activity_id,
                    "distance_metres": 8000,
                    "duration_secs": 3000,
                },
                {
                    "segment_order": 2,
                    "activity_type_id": activity_id,
                    "distance_metres": 1000,
                    "duration_secs": 600,
                },
            ],
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["session_type"] == "cardio"
    assert len(data["segments"]) == 2
    assert data["segments"][0]["distance_metres"] == 8000
    assert data["segments"][1]["distance_metres"] == 1000


# ── PUT /plans/{week_start}/sessions/{id} ────────────────────────────────────


async def test_put_cardio_replaces_segments(db_session, auth_client: AsyncClient):
    activity_id = await _create_cardio_type(auth_client)
    activity_id2 = await _create_cardio_type(auth_client, "Cycle")

    # Create with 2 segments
    create_resp = await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": THIS_MONDAY.isoformat(),
            "session_type": "cardio",
            "segments": [
                {"segment_order": 1, "activity_type_id": activity_id, "distance_metres": 5000},
                {"segment_order": 2, "activity_type_id": activity_id, "distance_metres": 3000},
            ],
        },
    )
    session_id = create_resp.json()["id"]

    # Update with 1 new segment of a different type
    update_resp = await auth_client.put(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions/{session_id}",
        json={
            "planned_date": THIS_MONDAY.isoformat(),
            "session_type": "cardio",
            "segments": [
                {"segment_order": 1, "activity_type_id": activity_id2, "distance_metres": 10000},
            ],
        },
    )
    assert update_resp.status_code == 200
    data = update_resp.json()
    assert len(data["segments"]) == 1
    assert data["segments"][0]["activity_type_id"] == activity_id2
    assert data["segments"][0]["distance_metres"] == 10000


# ── DELETE /plans/{week_start}/sessions/{id} ─────────────────────────────────


async def test_delete_planned_session(db_session, auth_client: AsyncClient):
    tmpl_id = await _create_template(auth_client)
    create_resp = await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": THIS_MONDAY.isoformat(),
            "session_type": "strength",
            "template_id": tmpl_id,
        },
    )
    session_id = create_resp.json()["id"]

    del_resp = await auth_client.delete(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions/{session_id}"
    )
    assert del_resp.status_code == 204

    plan_resp = await auth_client.get(f"/api/plans/{THIS_MONDAY.isoformat()}")
    assert plan_resp.json()["sessions"] == []


async def test_delete_unknown_session_returns_404(db_session, auth_client: AsyncClient):
    resp = await auth_client.delete(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions/9999"
    )
    assert resp.status_code == 404


async def test_delete_cardio_session_cascades_segments(db_session, auth_client: AsyncClient):
    activity_id = await _create_cardio_type(auth_client)
    create_resp = await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": THIS_MONDAY.isoformat(),
            "session_type": "cardio",
            "segments": [
                {"segment_order": 1, "activity_type_id": activity_id, "distance_metres": 5000}
            ],
        },
    )
    session_id = create_resp.json()["id"]

    await auth_client.delete(f"/api/plans/{THIS_MONDAY.isoformat()}/sessions/{session_id}")

    plan_resp = await auth_client.get(f"/api/plans/{THIS_MONDAY.isoformat()}")
    assert plan_resp.json()["sessions"] == []


# ── PATCH /plans/{week_start}/sessions/{id}/skip-note ────────────────────────


async def test_skip_note_set_and_clear(db_session, auth_client: AsyncClient):
    tmpl_id = await _create_template(auth_client)
    create_resp = await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": THIS_MONDAY.isoformat(),
            "session_type": "strength",
            "template_id": tmpl_id,
        },
    )
    session_id = create_resp.json()["id"]
    week = THIS_MONDAY.isoformat()

    # Set the skip note
    patch_resp = await auth_client.patch(
        f"/api/plans/{week}/sessions/{session_id}/skip-note",
        json={"skip_note": "knee pain"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["skip_note"] == "knee pain"

    # Clear the skip note
    clear_resp = await auth_client.patch(
        f"/api/plans/{week}/sessions/{session_id}/skip-note",
        json={"skip_note": None},
    )
    assert clear_resp.status_code == 200
    assert clear_resp.json()["skip_note"] is None


# ── POST /plans/{week_start}/copy-from-last-week ─────────────────────────────


async def test_copy_from_last_week_clones_sessions(db_session, auth_client: AsyncClient):
    activity_id = await _create_cardio_type(auth_client)
    prev_monday = PAST_MONDAY

    # Create a session with a skip note in the previous week
    create_resp = await auth_client.post(
        f"/api/plans/{prev_monday.isoformat()}/sessions",
        json={
            "planned_date": (prev_monday + timedelta(days=1)).isoformat(),
            "session_type": "cardio",
            "segments": [
                {"segment_order": 1, "activity_type_id": activity_id, "distance_metres": 5000}
            ],
        },
    )
    session_id = create_resp.json()["id"]

    # Set a skip note on the previous week's session
    await auth_client.patch(
        f"/api/plans/{prev_monday.isoformat()}/sessions/{session_id}/skip-note",
        json={"skip_note": "was sick"},
    )

    # Copy to next week relative to prev_monday (i.e., THIS_MONDAY)
    copy_resp = await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/copy-from-last-week"
    )
    assert copy_resp.status_code == 200
    data = copy_resp.json()
    assert len(data["sessions"]) == 1
    cloned = data["sessions"][0]

    # Date should be shifted +7 days
    expected_date = (prev_monday + timedelta(days=1) + timedelta(weeks=1)).isoformat()
    assert cloned["planned_date"] == expected_date

    # Skip note must NOT be copied
    assert cloned["skip_note"] is None

    # Segments preserved
    assert len(cloned["segments"]) == 1
    assert cloned["segments"][0]["distance_metres"] == 5000


async def test_copy_from_last_week_non_empty_week_returns_409(db_session, auth_client: AsyncClient):
    tmpl_id = await _create_template(auth_client)

    # Add a session to the target week first
    await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/sessions",
        json={
            "planned_date": THIS_MONDAY.isoformat(),
            "session_type": "strength",
            "template_id": tmpl_id,
        },
    )

    resp = await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/copy-from-last-week"
    )
    assert resp.status_code == 409
    assert "already has a plan" in resp.json()["detail"]


async def test_copy_from_empty_last_week_returns_empty_plan(db_session, auth_client: AsyncClient):
    # No sessions in the previous week — copy should succeed but yield no sessions
    resp = await auth_client.post(
        f"/api/plans/{THIS_MONDAY.isoformat()}/copy-from-last-week"
    )
    assert resp.status_code == 200
    assert resp.json()["sessions"] == []
