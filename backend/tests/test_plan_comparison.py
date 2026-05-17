"""Tests for GET /api/plan/sessions/{id}/comparison (Group 5.3)."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.models.plan import PlannedSession

TODAY = date.today()
THIS_MONDAY = TODAY - timedelta(days=TODAY.weekday())
FUTURE_DATE = THIS_MONDAY + timedelta(weeks=2, days=3)


# ── helpers ───────────────────────────────────────────────────────────────────

async def _create_exercise(client: AsyncClient, name: str = "Squat") -> int:
    resp = await client.post("/api/exercises", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_cardio_type(client: AsyncClient, name: str = "Run") -> int:
    resp = await client.post("/api/cardio-types", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_template(client: AsyncClient, exercises: list[tuple[int, list[tuple[int, float]]]]) -> int:
    """Create a strength template. exercises = [(ex_id, [(reps, weight_kg), ...]), ...]"""
    resp = await client.post("/api/templates/strength", json={
        "name": "Test Template",
        "exercises": [
            {
                "exercise_id": ex_id,
                "order": i + 1,
                "sets": [
                    {"set_number": j + 1, "reps": reps, "weight_kg": wkg}
                    for j, (reps, wkg) in enumerate(sets)
                ],
            }
            for i, (ex_id, sets) in enumerate(exercises)
        ],
    })
    assert resp.status_code == 201
    return resp.json()["id"]


async def _plan_strength(client: AsyncClient, on_date: date, template_id: int) -> dict:
    week_start = on_date - timedelta(days=on_date.weekday())
    resp = await client.post(
        f"/api/plans/{week_start.isoformat()}/sessions",
        json={"planned_date": on_date.isoformat(), "session_type": "strength", "template_id": template_id},
    )
    assert resp.status_code == 201
    return resp.json()


async def _plan_cardio(
    client: AsyncClient,
    on_date: date,
    activity_type_id: int,
    segments: list[dict],
) -> dict:
    week_start = on_date - timedelta(days=on_date.weekday())
    resp = await client.post(
        f"/api/plans/{week_start.isoformat()}/sessions",
        json={
            "planned_date": on_date.isoformat(),
            "session_type": "cardio",
            "activity_type_id": activity_type_id,
            "segments": segments,
        },
    )
    assert resp.status_code == 201
    return resp.json()


async def _log_strength(
    client: AsyncClient,
    on_date: date,
    template_id: int,
    exercises: list[tuple[int, list[tuple[int, float]]]],
) -> dict:
    """Log a strength session. exercises = [(ex_id, [(reps, weight), ...]), ...]"""
    resp = await client.post("/api/sessions/strength", json={
        "date": f"{on_date.isoformat()}T08:00:00Z",
        "template_id": template_id,
        "exercises": [
            {
                "exercise_id": ex_id,
                "order": i + 1,
                "sets": [
                    {"set_number": j + 1, "reps": reps, "weight": wt}
                    for j, (reps, wt) in enumerate(sets)
                ],
            }
            for i, (ex_id, sets) in enumerate(exercises)
        ],
    })
    assert resp.status_code == 201
    return resp.json()


async def _log_cardio(
    client: AsyncClient,
    on_date: date,
    activity_type_id: int,
    distance_m: float,
    duration_s: int,
) -> dict:
    resp = await client.post("/api/sessions/cardio", json={
        "date": f"{on_date.isoformat()}T08:00:00Z",
        "activity_type_id": activity_type_id,
        "total_duration_seconds": duration_s,
        "segments": [
            {
                "order": 1,
                "duration_seconds": duration_s,
                "distance_meters": distance_m,
                "activity_type_id": activity_type_id,
            }
        ],
    })
    assert resp.status_code == 201
    return resp.json()


# ── cardio comparison ─────────────────────────────────────────────────────────

async def test_comparison_cardio_basic(db_session, auth_client: AsyncClient):
    at_id = await _create_cardio_type(auth_client)
    on_date = THIS_MONDAY

    planned = await _plan_cardio(auth_client, on_date, at_id, [
        {"segment_order": 1, "distance_metres": 4000, "duration_secs": 1200},
        {"segment_order": 2, "distance_metres": 4000, "duration_secs": 1200},
    ])
    await _log_cardio(auth_client, on_date, at_id, 7500.0, 2880)

    resp = await auth_client.get(f"/api/plan/sessions/{planned['id']}/comparison")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_type"] == "cardio"
    assert data["strength"] is None
    c = data["cardio"]
    assert c["planned_distance_km"] == pytest.approx(8.0)
    assert c["planned_duration_min"] == pytest.approx(40.0)
    assert c["actual_distance_km"] == pytest.approx(7.5)
    assert c["actual_duration_min"] == pytest.approx(48.0)


# ── strength comparison ───────────────────────────────────────────────────────

async def test_comparison_strength_basic(db_session, auth_client: AsyncClient):
    ex1_id = await _create_exercise(auth_client, "Squat")
    ex2_id = await _create_exercise(auth_client, "Bench Press")
    tmpl_id = await _create_template(auth_client, [
        (ex1_id, [(5, 100.0), (5, 100.0), (5, 100.0)]),
        (ex2_id, [(8, 60.0), (8, 60.0), (8, 60.0)]),
    ])
    on_date = THIS_MONDAY
    planned = await _plan_strength(auth_client, on_date, tmpl_id)

    await _log_strength(auth_client, on_date, tmpl_id, [
        (ex1_id, [(5, 110.0), (5, 110.0), (5, 110.0)]),
        (ex2_id, [(8, 65.0), (8, 65.0), (8, 65.0)]),
    ])

    resp = await auth_client.get(f"/api/plan/sessions/{planned['id']}/comparison")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_type"] == "strength"
    assert data["cardio"] is None
    s = data["strength"]
    assert len(s["exercises"]) == 2

    ex1_out = s["exercises"][0]
    assert ex1_out["exercise_name"] == "Squat"
    assert ex1_out["source"] == "both"
    assert len(ex1_out["sets"]) == 3
    assert ex1_out["sets"][0]["planned_reps"] == 5
    assert ex1_out["sets"][0]["planned_weight_kg"] == pytest.approx(100.0)
    assert ex1_out["sets"][0]["actual_reps"] == 5
    assert ex1_out["sets"][0]["actual_weight_kg"] == pytest.approx(110.0)
    assert ex1_out["planned_volume"] == pytest.approx(1500.0)
    assert ex1_out["actual_volume"] == pytest.approx(1650.0)

    assert s["planned_total_volume"] == pytest.approx(1500.0 + 8 * 60.0 * 3)
    assert s["actual_total_volume"] == pytest.approx(1650.0 + 8 * 65.0 * 3)


async def test_comparison_strength_extra_exercise_in_actual(db_session, auth_client: AsyncClient):
    ex1_id = await _create_exercise(auth_client, "Squat")
    ex2_id = await _create_exercise(auth_client, "Extra Exercise")
    tmpl_id = await _create_template(auth_client, [(ex1_id, [(5, 100.0)])])
    on_date = THIS_MONDAY
    planned = await _plan_strength(auth_client, on_date, tmpl_id)

    await _log_strength(auth_client, on_date, tmpl_id, [
        (ex1_id, [(5, 100.0)]),
        (ex2_id, [(10, 50.0)]),
    ])

    resp = await auth_client.get(f"/api/plan/sessions/{planned['id']}/comparison")
    assert resp.status_code == 200
    s = resp.json()["strength"]
    assert len(s["exercises"]) == 2

    extra = next(e for e in s["exercises"] if e["exercise_name"] == "Extra Exercise")
    assert extra["source"] == "actual_only"
    assert extra["sets"][0]["planned_reps"] is None
    assert extra["sets"][0]["planned_weight_kg"] is None
    assert extra["sets"][0]["actual_reps"] == 10
    assert extra["sets"][0]["actual_weight_kg"] == pytest.approx(50.0)


async def test_comparison_strength_exercise_only_in_template(db_session, auth_client: AsyncClient):
    ex1_id = await _create_exercise(auth_client, "Squat")
    ex2_id = await _create_exercise(auth_client, "Skipped Exercise")
    tmpl_id = await _create_template(auth_client, [
        (ex1_id, [(5, 100.0)]),
        (ex2_id, [(8, 50.0)]),
    ])
    on_date = THIS_MONDAY
    planned = await _plan_strength(auth_client, on_date, tmpl_id)

    # Only log ex1, skip ex2
    await _log_strength(auth_client, on_date, tmpl_id, [(ex1_id, [(5, 100.0)])])

    resp = await auth_client.get(f"/api/plan/sessions/{planned['id']}/comparison")
    assert resp.status_code == 200
    s = resp.json()["strength"]
    assert len(s["exercises"]) == 2

    skipped = next(e for e in s["exercises"] if e["exercise_name"] == "Skipped Exercise")
    assert skipped["source"] == "planned_only"
    assert skipped["sets"][0]["actual_reps"] is None
    assert skipped["sets"][0]["actual_weight_kg"] is None
    assert skipped["sets"][0]["planned_reps"] == 8
    assert skipped["sets"][0]["planned_weight_kg"] == pytest.approx(50.0)


async def test_comparison_strength_set_count_mismatch(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client, "Squat")
    tmpl_id = await _create_template(auth_client, [(ex_id, [(5, 100.0), (5, 100.0), (5, 100.0)])])
    on_date = THIS_MONDAY
    planned = await _plan_strength(auth_client, on_date, tmpl_id)

    # Log 4 sets — one more than planned
    await _log_strength(auth_client, on_date, tmpl_id, [
        (ex_id, [(5, 100.0), (5, 100.0), (5, 100.0), (5, 110.0)]),
    ])

    resp = await auth_client.get(f"/api/plan/sessions/{planned['id']}/comparison")
    assert resp.status_code == 200
    ex_out = resp.json()["strength"]["exercises"][0]
    assert len(ex_out["sets"]) == 4
    assert ex_out["sets"][3]["planned_reps"] is None
    assert ex_out["sets"][3]["planned_weight_kg"] is None
    assert ex_out["sets"][3]["actual_reps"] == 5
    assert ex_out["sets"][3]["actual_weight_kg"] == pytest.approx(110.0)


# ── error cases ───────────────────────────────────────────────────────────────

async def test_comparison_not_done_returns_404(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    tmpl_id = await _create_template(auth_client, [(ex_id, [(5, 100.0)])])
    # Plan for a future date with no logged session
    planned = await _plan_strength(auth_client, FUTURE_DATE, tmpl_id)

    resp = await auth_client.get(f"/api/plan/sessions/{planned['id']}/comparison")
    assert resp.status_code == 404
    assert "not done" in resp.json()["detail"].lower()


async def test_comparison_no_template_version_returns_404(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    tmpl_id = await _create_template(auth_client, [(ex_id, [(5, 100.0)])])
    on_date = THIS_MONDAY
    planned = await _plan_strength(auth_client, on_date, tmpl_id)

    await _log_strength(auth_client, on_date, tmpl_id, [(ex_id, [(5, 100.0)])])

    # Directly null out the template_version to simulate a pre-Phase-14 session
    async with db_session() as db:
        await db.execute(
            update(PlannedSession)
            .where(PlannedSession.id == planned["id"])
            .values(template_version=None)
        )
        await db.commit()

    resp = await auth_client.get(f"/api/plan/sessions/{planned['id']}/comparison")
    assert resp.status_code == 404
    assert "predates versioning" in resp.json()["detail"].lower()


async def test_comparison_wrong_user_returns_403(
    db_session, auth_client: AsyncClient, auth_client_2: AsyncClient
):
    ex_id = await _create_exercise(auth_client)
    tmpl_id = await _create_template(auth_client, [(ex_id, [(5, 100.0)])])
    planned = await _plan_strength(auth_client, THIS_MONDAY, tmpl_id)

    resp = await auth_client_2.get(f"/api/plan/sessions/{planned['id']}/comparison")
    assert resp.status_code == 403
