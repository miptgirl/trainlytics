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
