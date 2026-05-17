"""Tests for /api/analytics/* endpoints."""
from datetime import datetime, timezone, timedelta

import pytest
from httpx import AsyncClient


# ── helpers ───────────────────────────────────────────────────────────────────

async def _create_cardio_type(client: AsyncClient, name: str) -> int:
    resp = await client.post("/api/cardio-types", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_exercise_type(client: AsyncClient, name: str) -> int:
    resp = await client.post("/api/exercise-types", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_exercise(client: AsyncClient, name: str, type_ids: list[int] | None = None) -> int:
    payload: dict = {"name": name}
    if type_ids is not None:
        payload["type_ids"] = type_ids
    resp = await client.post("/api/exercises", json=payload)
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_cardio_session(client: AsyncClient, date: str, segments: list[dict], **kwargs) -> dict:
    payload = {"date": date, "segments": segments, **kwargs}
    resp = await client.post("/api/sessions/cardio", json=payload)
    assert resp.status_code == 201
    return resp.json()


async def _create_strength_session(client: AsyncClient, date: str, exercises: list[dict], **kwargs) -> dict:
    payload = {"date": date, "exercises": exercises, **kwargs}
    resp = await client.post("/api/sessions/strength", json=payload)
    assert resp.status_code == 201
    return resp.json()


# ── 1.1  Summary ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_summary_no_sessions(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.get("/api/analytics/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_sessions"] == 0
    assert data["total_minutes"] == 0
    assert data["total_distance_km"] == 0.0


@pytest.mark.asyncio
async def test_summary_with_sessions(auth_client: AsyncClient, db_session: None) -> None:
    at_id = await _create_cardio_type(auth_client, "Run")
    ex_id = await _create_exercise(auth_client, "Squat")

    # Cardio: 3600s, 5000m
    await _create_cardio_session(
        auth_client,
        "2026-01-10T08:00:00Z",
        [{"order": 1, "duration_seconds": 3600, "distance_meters": 5000.0,
          "activity_type_id": at_id}],
        total_duration_seconds=3600,
        activity_type_id=at_id,
    )
    # Strength: 1800s
    await _create_strength_session(
        auth_client,
        "2026-01-11T08:00:00Z",
        [{"exercise_id": ex_id, "order": 1,
          "sets": [{"set_number": 1, "reps": 5, "weight": 100.0}]}],
        duration_seconds=1800,
    )

    resp = await auth_client.get("/api/analytics/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_sessions"] == 2
    # (3600 + 1800) // 60 = 90
    assert data["total_minutes"] == 90
    assert data["total_distance_km"] == 5.0


# ── 1.2  Strength progression ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_strength_progression_unknown_exercise(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.get("/api/analytics/strength/progression?exercise_id=9999")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_strength_progression_with_data(auth_client: AsyncClient, db_session: None) -> None:
    ex_id = await _create_exercise(auth_client, "Deadlift")

    await _create_strength_session(
        auth_client,
        "2026-01-05T08:00:00Z",
        [{"exercise_id": ex_id, "order": 1,
          "sets": [
              {"set_number": 1, "reps": 5, "weight": 100.0},
              {"set_number": 2, "reps": 3, "weight": 110.0},
          ]}],
    )
    await _create_strength_session(
        auth_client,
        "2026-01-12T08:00:00Z",
        [{"exercise_id": ex_id, "order": 1,
          "sets": [{"set_number": 1, "reps": 5, "weight": 120.0}]}],
    )

    resp = await auth_client.get(f"/api/analytics/strength/progression?exercise_id={ex_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2

    first = data[0]
    assert first["max_weight"] == 110.0
    assert first["total_volume"] == pytest.approx(100.0 * 5 + 110.0 * 3)

    second = data[1]
    assert second["max_weight"] == 120.0
    assert second["total_volume"] == pytest.approx(120.0 * 5)


# ── 1.3  Personal records ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_strength_records_with_tags(auth_client: AsyncClient, db_session: None) -> None:
    push_id = await _create_exercise_type(auth_client, "Push")
    legs_id = await _create_exercise_type(auth_client, "Legs")
    bench_id = await _create_exercise(auth_client, "Bench", type_ids=[push_id])
    squat_id = await _create_exercise(auth_client, "Squat", type_ids=[legs_id])
    untagged_id = await _create_exercise(auth_client, "Untagged Exercise")

    await _create_strength_session(
        auth_client,
        "2026-01-10T08:00:00Z",
        [
            {"exercise_id": bench_id, "order": 1,
             "sets": [{"set_number": 1, "reps": 8, "weight": 80.0},
                      {"set_number": 2, "reps": 5, "weight": 90.0}]},
            {"exercise_id": squat_id, "order": 2,
             "sets": [{"set_number": 1, "reps": 5, "weight": 120.0}]},
            {"exercise_id": untagged_id, "order": 3,
             "sets": [{"set_number": 1, "reps": 10, "weight": 50.0}]},
        ],
    )

    resp = await auth_client.get("/api/analytics/strength/records")
    assert resp.status_code == 200
    groups = resp.json()

    group_map = {g["tag"]: g for g in groups}
    assert "Push" in group_map
    assert "Legs" in group_map
    assert "untagged" in group_map

    bench_record = next(r for r in group_map["Push"]["records"] if r["exercise_name"] == "Bench")
    assert bench_record["heaviest_weight"] == 90.0
    assert bench_record["best_reps_at_heaviest"] == 5
    assert bench_record["best_single_set_volume"] == pytest.approx(80.0 * 8)  # 640 > 450

    squat_record = group_map["Legs"]["records"][0]
    assert squat_record["heaviest_weight"] == 120.0

    untagged_record = group_map["untagged"]["records"][0]
    assert untagged_record["exercise_name"] == "Untagged Exercise"

    # untagged group is last
    assert groups[-1]["tag"] == "untagged"


# ── 1.4  Volume by tag ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_strength_volume_by_tag(auth_client: AsyncClient, db_session: None) -> None:
    push_id = await _create_exercise_type(auth_client, "Push")
    bench_id = await _create_exercise(auth_client, "Bench", type_ids=[push_id])

    await _create_strength_session(
        auth_client,
        "2026-01-05T08:00:00Z",
        [{"exercise_id": bench_id, "order": 1,
          "sets": [{"set_number": 1, "reps": 8, "weight": 80.0}]}],
    )
    await _create_strength_session(
        auth_client,
        "2026-01-12T08:00:00Z",
        [{"exercise_id": bench_id, "order": 1,
          "sets": [{"set_number": 1, "reps": 5, "weight": 100.0}]}],
    )

    resp = await auth_client.get("/api/analytics/strength/volume-by-tag?weeks=52")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 2

    push_points = [p for p in data if p["tag"] == "Push"]
    totals = [p["total_volume"] for p in push_points]
    assert pytest.approx(80.0 * 8) in totals
    assert pytest.approx(100.0 * 5) in totals


# ── 1.5  Cardio time split ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cardio_time_split(auth_client: AsyncClient, db_session: None) -> None:
    run_id = await _create_cardio_type(auth_client, "Run")
    bike_id = await _create_cardio_type(auth_client, "Bike")

    now = datetime.now(timezone.utc)
    date1 = (now - timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    date2 = (now - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ")

    await _create_cardio_session(
        auth_client, date1,
        [{"order": 1, "duration_seconds": 1800, "activity_type_id": run_id}],
    )
    await _create_cardio_session(
        auth_client, date2,
        [{"order": 1, "duration_seconds": 3600, "activity_type_id": bike_id}],
    )

    resp = await auth_client.get("/api/analytics/cardio/time-split?period=30")
    assert resp.status_code == 200
    data = resp.json()

    by_type = {p["activity_type"]: p["total_minutes"] for p in data}
    assert by_type["Run"] == pytest.approx(30.0)
    assert by_type["Bike"] == pytest.approx(60.0)


# ── 1.6  Walk segments ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cardio_walk_segments(auth_client: AsyncClient, db_session: None) -> None:
    walk_id = await _create_cardio_type(auth_client, "Walk")
    run_id = await _create_cardio_type(auth_client, "Run")

    # Session 1: 2 walk + 1 run segment
    s1 = await _create_cardio_session(
        auth_client, "2026-01-10T08:00:00Z",
        [
            {"order": 1, "duration_seconds": 300, "activity_type_id": walk_id},
            {"order": 2, "duration_seconds": 1800, "activity_type_id": run_id},
            {"order": 3, "duration_seconds": 300, "activity_type_id": walk_id},
        ],
        title="Mixed run",
    )

    # Session 2: no walk segments (run only)
    s2 = await _create_cardio_session(
        auth_client, "2026-01-17T08:00:00Z",
        [{"order": 1, "duration_seconds": 3600, "activity_type_id": run_id}],
        title="Pure run",
    )

    # Session 3: walk only
    s3 = await _create_cardio_session(
        auth_client, "2026-01-24T08:00:00Z",
        [
            {"order": 1, "duration_seconds": 600, "activity_type_id": walk_id},
            {"order": 2, "duration_seconds": 600, "activity_type_id": walk_id},
            {"order": 3, "duration_seconds": 600, "activity_type_id": walk_id},
        ],
        title="Walk only",
    )

    resp = await auth_client.get("/api/analytics/cardio/walk-segments")
    assert resp.status_code == 200
    data = resp.json()
    by_title = {d["session_title"]: d["walk_segment_count"] for d in data}

    assert by_title["Mixed run"] == 2
    assert by_title["Pure run"] == 0
    assert by_title["Walk only"] == 3


# ── 1.7  Distance progression ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cardio_distance_progression_excludes_no_distance(
    auth_client: AsyncClient, db_session: None
) -> None:
    run_id = await _create_cardio_type(auth_client, "Run")
    yoga_id = await _create_cardio_type(auth_client, "Yoga")

    await _create_cardio_session(
        auth_client, "2026-01-10T08:00:00Z",
        [{"order": 1, "duration_seconds": 1800, "distance_meters": 5000.0, "activity_type_id": run_id}],
    )
    await _create_cardio_session(
        auth_client, "2026-01-10T09:00:00Z",
        [{"order": 1, "duration_seconds": 3600, "activity_type_id": yoga_id}],  # no distance
    )

    resp = await auth_client.get("/api/analytics/cardio/distance-progression")
    assert resp.status_code == 200
    data = resp.json()
    types_present = {d["activity_type"] for d in data}
    assert "Run" in types_present
    assert "Yoga" not in types_present


# ── 1.8  Training load ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_training_load(auth_client: AsyncClient, db_session: None) -> None:
    run_id = await _create_cardio_type(auth_client, "Run")
    ex_id = await _create_exercise(auth_client, "Squat")

    await _create_cardio_session(
        auth_client, "2026-01-05T08:00:00Z",
        [{"order": 1, "duration_seconds": 1800, "distance_meters": 5000.0, "activity_type_id": run_id}],
        total_duration_seconds=1800,
    )
    await _create_strength_session(
        auth_client, "2026-01-06T08:00:00Z",
        [{"exercise_id": ex_id, "order": 1,
          "sets": [{"set_number": 1, "reps": 5, "weight": 100.0}]}],
        duration_seconds=3600,
    )

    resp = await auth_client.get("/api/analytics/training-load")
    assert resp.status_code == 200
    data = resp.json()

    windows = {w["window"]: w for w in data}
    assert 4 in windows
    assert 8 in windows
    assert len(windows[4]["data"]) > 0
    assert len(windows[8]["data"]) > 0


# ── 1.9  Readiness trends ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_readiness_trends_excludes_nulls(auth_client: AsyncClient, db_session: None) -> None:
    run_id = await _create_cardio_type(auth_client, "Run")

    # Session with wellbeing and rpe
    await _create_cardio_session(
        auth_client, "2026-01-05T08:00:00Z",
        [{"order": 1, "duration_seconds": 1800, "activity_type_id": run_id}],
        wellbeing=4, rpe=3,
    )
    # Session with null values
    await _create_cardio_session(
        auth_client, "2026-01-06T08:00:00Z",
        [{"order": 1, "duration_seconds": 1800, "activity_type_id": run_id}],
    )
    # Another session same week, only wellbeing
    await _create_cardio_session(
        auth_client, "2026-01-07T08:00:00Z",
        [{"order": 1, "duration_seconds": 1800, "activity_type_id": run_id}],
        wellbeing=2,
    )

    resp = await auth_client.get("/api/analytics/readiness/trends")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1

    week_point = data[0]
    # avg_wellbeing: (4 + 2) / 2 = 3.0
    assert week_point["avg_wellbeing"] == pytest.approx(3.0)
    # avg_rpe: only one session with rpe=3
    assert week_point["avg_rpe"] == pytest.approx(3.0)


# ── 1.10 Readiness correlation ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_readiness_correlation_excludes_nulls(auth_client: AsyncClient, db_session: None) -> None:
    run_id = await _create_cardio_type(auth_client, "Run")
    ex_id = await _create_exercise(auth_client, "Bench")

    await _create_cardio_session(
        auth_client, "2026-01-05T08:00:00Z",
        [{"order": 1, "duration_seconds": 1800, "activity_type_id": run_id}],
        wellbeing=4, rpe=3,
    )
    await _create_cardio_session(
        auth_client, "2026-01-06T08:00:00Z",
        [{"order": 1, "duration_seconds": 1800, "activity_type_id": run_id}],
        # no wellbeing/rpe — should be excluded
    )
    await _create_strength_session(
        auth_client, "2026-01-07T08:00:00Z",
        [{"exercise_id": ex_id, "order": 1,
          "sets": [{"set_number": 1, "reps": 5, "weight": 80.0}]}],
        wellbeing=5, rpe=4,
    )

    resp = await auth_client.get("/api/analytics/readiness/correlation")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2

    types = {d["type"] for d in data}
    assert "cardio" in types
    assert "strength" in types

    for point in data:
        assert point["wellbeing"] is not None
        assert point["rpe"] is not None


# ── 1.11 Heatmap ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_heatmap(auth_client: AsyncClient, db_session: None) -> None:
    run_id = await _create_cardio_type(auth_client, "Run")
    ex_id = await _create_exercise(auth_client, "Squat")

    from datetime import date as DateType
    today = DateType.today()
    day1 = (today - timedelta(days=10)).strftime("%Y-%m-%dT08:00:00Z")
    day2 = (today - timedelta(days=5)).strftime("%Y-%m-%dT08:00:00Z")

    # day1: strength only
    await _create_strength_session(
        auth_client, day1,
        [{"exercise_id": ex_id, "order": 1,
          "sets": [{"set_number": 1, "reps": 5, "weight": 100.0}]}],
    )
    # day2: both cardio and strength
    await _create_cardio_session(
        auth_client, day2,
        [{"order": 1, "duration_seconds": 1800, "activity_type_id": run_id}],
    )
    await _create_strength_session(
        auth_client, day2,
        [{"exercise_id": ex_id, "order": 1,
          "sets": [{"set_number": 1, "reps": 5, "weight": 100.0}]}],
    )

    resp = await auth_client.get("/api/analytics/heatmap")
    assert resp.status_code == 200
    data = resp.json()

    by_date = {d["date"]: d["session_types"] for d in data}

    d1_str = (today - timedelta(days=10)).strftime("%Y-%m-%d")
    d2_str = (today - timedelta(days=5)).strftime("%Y-%m-%d")

    assert d1_str in by_date
    assert by_date[d1_str] == ["strength"]

    assert d2_str in by_date
    assert set(by_date[d2_str]) == {"cardio", "strength"}

    # days with no sessions are omitted
    absent_day = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    assert absent_day not in by_date


# ── Phase 12: COALESCE fallback tests (session-level activity type) ──────────

@pytest.mark.asyncio
async def test_cardio_time_split_uses_session_activity_type(
    auth_client: AsyncClient, db_session: None
) -> None:
    """Segments without per-segment activity_type_id should use the session-level type."""
    run_id = await _create_cardio_type(auth_client, "Run")

    now = datetime.now(timezone.utc)
    date1 = (now - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Segment has NO activity_type_id — only the session does
    await _create_cardio_session(
        auth_client, date1,
        [{"order": 1, "duration_seconds": 1800}],  # no activity_type_id on segment
        activity_type_id=run_id,
    )

    resp = await auth_client.get("/api/analytics/cardio/time-split?period=30")
    assert resp.status_code == 200
    data = resp.json()
    by_type = {p["activity_type"]: p["total_minutes"] for p in data}
    assert "Run" in by_type
    assert by_type["Run"] == pytest.approx(30.0)


@pytest.mark.asyncio
async def test_cardio_walk_segments_uses_session_activity_type(
    auth_client: AsyncClient, db_session: None
) -> None:
    """Walk sessions without per-segment types should count their segments as walk."""
    walk_id = await _create_cardio_type(auth_client, "Walk")

    # 3-segment Walk session, no per-segment activity_type_id
    await _create_cardio_session(
        auth_client, "2026-02-01T08:00:00Z",
        [
            {"order": 1, "duration_seconds": 600},
            {"order": 2, "duration_seconds": 600},
            {"order": 3, "duration_seconds": 600},
        ],
        activity_type_id=walk_id,
        title="Walk session",
    )

    resp = await auth_client.get("/api/analytics/cardio/walk-segments")
    assert resp.status_code == 200
    data = resp.json()
    by_title = {d["session_title"]: d["walk_segment_count"] for d in data}
    assert by_title["Walk session"] == 3


@pytest.mark.asyncio
async def test_cardio_distance_progression_uses_session_activity_type(
    auth_client: AsyncClient, db_session: None
) -> None:
    """Distance data on segments without per-segment type should use session-level type."""
    run_id = await _create_cardio_type(auth_client, "Run")

    await _create_cardio_session(
        auth_client, "2026-02-10T08:00:00Z",
        [{"order": 1, "duration_seconds": 1800, "distance_meters": 5000.0}],  # no segment AT
        activity_type_id=run_id,
    )

    resp = await auth_client.get("/api/analytics/cardio/distance-progression")
    assert resp.status_code == 200
    data = resp.json()
    types_present = {d["activity_type"] for d in data}
    assert "Run" in types_present
    total_km = sum(d["cumulative_distance_km"] for d in data if d["activity_type"] == "Run")
    assert total_km == pytest.approx(5.0)


# ── Phase 12: debug=true tests ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_analytics_debug_flag(auth_client: AsyncClient, db_session: None) -> None:
    """Any analytics endpoint with ?debug=true returns {data, debug: {sql}} with non-empty SQL."""
    run_id = await _create_cardio_type(auth_client, "Run")
    now = datetime.now(timezone.utc)
    date1 = (now - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")

    await _create_cardio_session(
        auth_client, date1,
        [{"order": 1, "duration_seconds": 1800}],
        activity_type_id=run_id,
    )

    resp = await auth_client.get("/api/analytics/cardio/time-split?period=30&debug=true")
    assert resp.status_code == 200
    body = resp.json()

    assert "data" in body
    assert "debug" in body
    assert "sql" in body["debug"]
    sql = body["debug"]["sql"]
    assert isinstance(sql, str) and len(sql) > 0
    assert "cardio_segments" in sql.lower() or "cardio_sessions" in sql.lower()


@pytest.mark.asyncio
async def test_analytics_debug_false_returns_normal_shape(
    auth_client: AsyncClient, db_session: None
) -> None:
    """Without ?debug=true, response shape is unchanged (a plain list)."""
    resp = await auth_client.get("/api/analytics/cardio/time-split?period=30")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# ── Phase 12: new endpoints ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_overview_trends(auth_client: AsyncClient, db_session: None) -> None:
    """overview-trends returns one point per week with correct counts, minutes, and volume."""
    run_id = await _create_cardio_type(auth_client, "Run")
    ex_id = await _create_exercise(auth_client, "Squat")

    # Week A: 2 sessions — 1 cardio (30 min) + 1 strength (60 min, 500 volume)
    week_a = (datetime.now(timezone.utc) - timedelta(weeks=2))
    week_a_monday = week_a - timedelta(days=week_a.weekday())
    day_a1 = week_a_monday.strftime("%Y-%m-%dT08:00:00Z")
    day_a2 = (week_a_monday + timedelta(days=1)).strftime("%Y-%m-%dT08:00:00Z")

    await _create_cardio_session(
        auth_client, day_a1,
        [{"order": 1, "duration_seconds": 1800, "activity_type_id": run_id}],
        total_duration_seconds=1800,
    )
    await _create_strength_session(
        auth_client, day_a2,
        [{"exercise_id": ex_id, "order": 1,
          "sets": [{"set_number": 1, "reps": 5, "weight": 100.0}]}],
        duration_seconds=3600,
    )

    # Week B: 1 strength session (45 min, 200 volume)
    week_b = (datetime.now(timezone.utc) - timedelta(weeks=1))
    week_b_monday = week_b - timedelta(days=week_b.weekday())
    day_b = week_b_monday.strftime("%Y-%m-%dT08:00:00Z")

    await _create_strength_session(
        auth_client, day_b,
        [{"exercise_id": ex_id, "order": 1,
          "sets": [{"set_number": 1, "reps": 4, "weight": 50.0}]}],
        duration_seconds=2700,
    )

    resp = await auth_client.get("/api/analytics/overview-trends?weeks=4")
    assert resp.status_code == 200
    points = resp.json()
    # endpoint returns weeks from (current_monday - N weeks) through current_monday inclusive
    assert len(points) >= 4

    by_week = {p["week_start"]: p for p in points}
    wa_key = week_a_monday.date().isoformat()
    wb_key = week_b_monday.date().isoformat()

    assert wa_key in by_week
    wa = by_week[wa_key]
    assert wa["session_count"] == 2
    assert wa["total_minutes"] == (1800 + 3600) // 60  # 90
    assert wa["total_volume"] == pytest.approx(5 * 100.0)  # strength only

    assert wb_key in by_week
    wb = by_week[wb_key]
    assert wb["session_count"] == 1
    assert wb["total_minutes"] == 2700 // 60  # 45
    assert wb["total_volume"] == pytest.approx(4 * 50.0)


@pytest.mark.asyncio
async def test_exercises_by_type(auth_client: AsyncClient, db_session: None) -> None:
    """exercises-by-type returns distinct exercise counts per muscle-group tag per week."""
    push_id = await _create_exercise_type(auth_client, "Push")
    pull_id = await _create_exercise_type(auth_client, "Pull")
    bench_id = await _create_exercise(auth_client, "Bench", type_ids=[push_id])
    ohp_id = await _create_exercise(auth_client, "OHP", type_ids=[push_id])
    row_id = await _create_exercise(auth_client, "Row", type_ids=[pull_id])

    week = datetime.now(timezone.utc) - timedelta(weeks=1)
    monday = week - timedelta(days=week.weekday())
    day = monday.strftime("%Y-%m-%dT08:00:00Z")

    await _create_strength_session(
        auth_client, day,
        [
            {"exercise_id": bench_id, "order": 1,
             "sets": [{"set_number": 1, "reps": 5, "weight": 80.0}]},
            {"exercise_id": ohp_id, "order": 2,
             "sets": [{"set_number": 1, "reps": 8, "weight": 50.0}]},
            {"exercise_id": row_id, "order": 3,
             "sets": [{"set_number": 1, "reps": 8, "weight": 60.0}]},
        ],
    )

    resp = await auth_client.get("/api/analytics/strength/exercises-by-type?weeks=4")
    assert resp.status_code == 200
    points = resp.json()

    week_key = monday.date().isoformat()
    by_tag = {
        p["muscle_group_tag"]: p["exercise_count"]
        for p in points
        if p["week_start"] == week_key
    }
    assert by_tag["Push"] == 2  # Bench + OHP
    assert by_tag["Pull"] == 1  # Row only


@pytest.mark.asyncio
async def test_plan_adherence(auth_client: AsyncClient, db_session: None) -> None:
    """plan-adherence computes correct completion_pct and volume delta for a past week."""
    from datetime import date as DateType

    today = DateType.today()
    this_monday = today - timedelta(days=today.weekday())
    past_monday = this_monday - timedelta(weeks=1)
    past_date = past_monday + timedelta(days=2)  # Wednesday of last week

    # Create a template: 1 exercise, 1 set → planned_str_vol = 100*5 = 500
    ex_id = await _create_exercise(auth_client, "Deadlift")
    tmpl_resp = await auth_client.post(
        "/api/templates/strength",
        json={
            "name": "Strength Day",
            "exercises": [
                {
                    "exercise_id": ex_id,
                    "order": 1,
                    "sets": [{"set_number": 1, "reps": 5, "weight_kg": 100.0}],
                }
            ],
        },
    )
    assert tmpl_resp.status_code == 201
    tmpl_id = tmpl_resp.json()["id"]

    # Create a plan for last week
    plan_resp = await auth_client.get(f"/api/plans/{past_monday.isoformat()}")
    assert plan_resp.status_code == 200

    # Add a planned strength session on past_date
    sess_resp = await auth_client.post(
        f"/api/plans/{past_monday.isoformat()}/sessions",
        json={
            "planned_date": past_date.isoformat(),
            "session_type": "strength",
            "template_id": tmpl_id,
        },
    )
    assert sess_resp.status_code == 201

    # Log a matching strength session with lower volume: 80*5 = 400
    log_ex_id = await _create_exercise(auth_client, "DL-Logged")
    await _create_strength_session(
        auth_client,
        f"{past_date.isoformat()}T08:00:00Z",
        [{"exercise_id": log_ex_id, "order": 1,
          "sets": [{"set_number": 1, "reps": 5, "weight": 80.0}]}],
        template_id=tmpl_id,
    )

    resp = await auth_client.get("/api/analytics/plan-adherence?weeks=12")
    assert resp.status_code == 200
    points = resp.json()

    week_entry = next((p for p in points if p["week_start"] == past_monday.isoformat()), None)
    assert week_entry is not None
    assert week_entry["completion_pct"] == pytest.approx(100.0)
    assert week_entry["strength_volume_delta"] == pytest.approx(400.0 - 500.0)  # -100


# ── Phase 13: HR zone trends ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_hr_zone_trends_aggregation(auth_client: AsyncClient, db_session: None) -> None:
    """Two sessions in the same week: z2_seconds summed and converted to minutes."""
    from datetime import date as DateType

    today = DateType.today()
    this_monday = today - timedelta(days=today.weekday())
    day = this_monday.strftime("%Y-%m-%dT08:00:00Z")

    # Session A: z2=600s, Session B: z2=300s → total 900s = 15.0 min
    await _create_cardio_session(
        auth_client, day,
        [{"order": 1, "duration_seconds": 1800}],
        z2_seconds=600,
    )
    await _create_cardio_session(
        auth_client, day,
        [{"order": 1, "duration_seconds": 1800}],
        z2_seconds=300,
    )

    resp = await auth_client.get("/api/analytics/cardio/hr-zone-trends")
    assert resp.status_code == 200
    rows = resp.json()

    week_key = this_monday.isoformat()
    week_row = next((r for r in rows if r["week_start"] == week_key), None)
    assert week_row is not None
    assert week_row["z2_minutes"] == pytest.approx(15.0)


@pytest.mark.asyncio
async def test_hr_zone_trends_null_zones_as_zero(auth_client: AsyncClient, db_session: None) -> None:
    """Session with null zone fields contributes 0 to that zone's total."""
    from datetime import date as DateType

    today = DateType.today()
    this_monday = today - timedelta(days=today.weekday())
    day = this_monday.strftime("%Y-%m-%dT08:00:00Z")

    # Only z3 is set; z1 is null
    await _create_cardio_session(
        auth_client, day,
        [{"order": 1, "duration_seconds": 1800}],
        z3_seconds=300,
    )

    resp = await auth_client.get("/api/analytics/cardio/hr-zone-trends")
    assert resp.status_code == 200
    rows = resp.json()

    week_key = this_monday.isoformat()
    week_row = next((r for r in rows if r["week_start"] == week_key), None)
    assert week_row is not None
    assert week_row["z1_minutes"] == pytest.approx(0.0)
    assert week_row["z3_minutes"] == pytest.approx(5.0)


@pytest.mark.asyncio
async def test_hr_zone_trends_debug_flag(auth_client: AsyncClient, db_session: None) -> None:
    """?debug=true wraps response in {data, debug: {sql}}."""
    resp = await auth_client.get("/api/analytics/cardio/hr-zone-trends?debug=true")
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    assert "debug" in body
    assert "sql" in body["debug"]
    assert isinstance(body["debug"]["sql"], str) and len(body["debug"]["sql"]) > 0
