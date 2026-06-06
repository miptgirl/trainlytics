from __future__ import annotations

from collections import defaultdict
from datetime import date as DateType
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.cardio_activity_type import CardioActivityType
from app.models.exercise import Exercise
from app.models.exercise_type import ExerciseType, exercise_exercise_types
from app.models.session import (
    CardioSegment,
    CardioSession,
    StrengthExerciseEntry,
    StrengthSession,
    StrengthSet,
    WorkoutSession,
)
from app.models.body_metrics import BodyMetrics
from app.models.user_settings import UserSettings
from app.schemas.analytics import (
    CardioTimeSplitPoint,
    DistanceProgressionPoint,
    ExercisesByTypePoint,
    HeatmapDay,
    HealthMetricsPoint,
    HrZoneTrendsRow,
    OverviewTrendsPoint,
    PersonalRecord,
    PlanAdherencePoint,
    ReadinessCorrelationPoint,
    ReadinessTrendPoint,
    RecordsGroupOut,
    SummaryOut,
    StrengthProgressionPoint,
    TrainingLoadPoint,
    TrainingLoadWindow,
    VolumeByTagPoint,
    WalkSegmentsPoint,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _render_sql(*queries) -> str:
    """Compile SQLAlchemy queries to readable SQL strings, substituting literal bind params."""
    from sqlalchemy.dialects import postgresql

    parts = []
    for i, q in enumerate(queries):
        try:
            sql = str(q.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        except Exception:
            sql = str(q.compile(dialect=postgresql.dialect()))
        parts.append(f"-- Query {i + 1}:\n{sql}" if len(queries) > 1 else sql)
    return "\n\n".join(parts)


def _debug_wrap(data: list, sql: str) -> JSONResponse:
    serialized = [item.model_dump(mode="json") if hasattr(item, "model_dump") else item for item in data]
    return JSONResponse({"data": serialized, "debug": {"sql": sql}})


# ── 1.1  Summary ─────────────────────────────────────────────────────────────

@router.get("/summary", response_model=SummaryOut)
async def get_summary(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    q_sessions = select(func.count(WorkoutSession.id)).where(WorkoutSession.user_id == user)
    q_strength = (
        select(func.sum(StrengthSession.duration_seconds))
        .join(WorkoutSession, WorkoutSession.id == StrengthSession.session_id)
        .where(WorkoutSession.user_id == user)
    )
    q_cardio = (
        select(func.sum(CardioSession.total_duration_seconds))
        .join(WorkoutSession, WorkoutSession.id == CardioSession.session_id)
        .where(WorkoutSession.user_id == user)
    )
    q_dist = (
        select(func.sum(CardioSegment.distance_meters))
        .join(CardioSession, CardioSession.id == CardioSegment.cardio_session_id)
        .join(WorkoutSession, WorkoutSession.id == CardioSession.session_id)
        .where(WorkoutSession.user_id == user)
    )

    total_sessions = (await db.execute(q_sessions)).scalar_one() or 0
    strength_seconds = (await db.execute(q_strength)).scalar_one() or 0
    cardio_seconds = (await db.execute(q_cardio)).scalar_one() or 0
    total_distance_m = (await db.execute(q_dist)).scalar_one() or 0.0

    total_minutes = (strength_seconds + cardio_seconds) // 60
    total_distance_km = round(total_distance_m / 1000, 2)

    result = SummaryOut(
        total_sessions=total_sessions,
        total_minutes=total_minutes,
        total_distance_km=total_distance_km,
    )
    if debug:
        return _debug_wrap([result], _render_sql(q_sessions, q_strength, q_cardio, q_dist))
    return result


# ── 1.2  Strength progression ─────────────────────────────────────────────────

@router.get("/strength/progression", response_model=list[StrengthProgressionPoint])
async def strength_progression(
    exercise_id: int = Query(...),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    query = (
        select(
            WorkoutSession.date,
            StrengthSet.weight,
            StrengthSet.reps,
        )
        .join(StrengthSession, StrengthSession.session_id == WorkoutSession.id)
        .join(StrengthExerciseEntry, StrengthExerciseEntry.strength_session_id == StrengthSession.id)
        .join(StrengthSet, StrengthSet.exercise_entry_id == StrengthExerciseEntry.id)
        .where(
            WorkoutSession.user_id == user,
            StrengthExerciseEntry.exercise_id == exercise_id,
            StrengthSet.weight.is_not(None),
            StrengthSet.reps.is_not(None),
        )
        .order_by(WorkoutSession.date)
    )
    rows = (await db.execute(query)).all()

    # Group by session date
    by_date: dict[DateType, list[tuple[float, int]]] = defaultdict(list)
    for row_date, weight, reps in rows:
        d = row_date.date() if hasattr(row_date, "date") else row_date
        by_date[d].append((weight, reps))

    result = []
    for d in sorted(by_date):
        sets = by_date[d]
        max_weight = max(w for w, _ in sets)
        total_volume = sum(w * r for w, r in sets)
        result.append(StrengthProgressionPoint(date=d, max_weight=max_weight, total_volume=total_volume))

    if debug:
        return _debug_wrap(result, _render_sql(query))
    return result


# ── 1.3  Personal records ─────────────────────────────────────────────────────

@router.get("/strength/records", response_model=list[RecordsGroupOut])
async def strength_records(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    q_rows = (
        select(
            StrengthExerciseEntry.exercise_id,
            Exercise.name,
            StrengthSet.weight,
            StrengthSet.reps,
        )
        .join(StrengthExerciseEntry, StrengthExerciseEntry.id == StrengthSet.exercise_entry_id)
        .join(StrengthSession, StrengthSession.id == StrengthExerciseEntry.strength_session_id)
        .join(WorkoutSession, WorkoutSession.id == StrengthSession.session_id)
        .join(Exercise, Exercise.id == StrengthExerciseEntry.exercise_id)
        .where(
            WorkoutSession.user_id == user,
            StrengthSet.weight.is_not(None),
            StrengthSet.reps.is_not(None),
        )
    )
    rows = (await db.execute(q_rows)).all()

    q_tags = (
        select(exercise_exercise_types.c.exercise_id, ExerciseType.name)
        .join(ExerciseType, ExerciseType.id == exercise_exercise_types.c.exercise_type_id)
        .join(Exercise, Exercise.id == exercise_exercise_types.c.exercise_id)
        .where(Exercise.user_id == user)
    )
    tag_rows = (await db.execute(q_tags)).all()

    exercise_tags: dict[int, list[str]] = defaultdict(list)
    for ex_id, tag_name in tag_rows:
        exercise_tags[ex_id].append(tag_name)

    # Per exercise: accumulate PR
    # pr_data[exercise_id] = (name, heaviest_weight, best_reps_at_heaviest, best_volume)
    pr_data: dict[int, dict] = {}
    for ex_id, ex_name, weight, reps in rows:
        vol = weight * reps
        if ex_id not in pr_data:
            pr_data[ex_id] = {
                "name": ex_name,
                "heaviest_weight": weight,
                "best_reps_at_heaviest": reps,
                "best_single_set_volume": vol,
            }
        else:
            entry = pr_data[ex_id]
            if weight > entry["heaviest_weight"]:
                entry["heaviest_weight"] = weight
                entry["best_reps_at_heaviest"] = reps
            elif weight == entry["heaviest_weight"] and reps > entry["best_reps_at_heaviest"]:
                entry["best_reps_at_heaviest"] = reps
            if vol > entry["best_single_set_volume"]:
                entry["best_single_set_volume"] = vol

    # Group by tag
    groups: dict[str, list[PersonalRecord]] = defaultdict(list)
    for ex_id, data in pr_data.items():
        tags = exercise_tags.get(ex_id, [])
        if not tags:
            tags = ["untagged"]
        for tag in tags:
            groups[tag].append(
                PersonalRecord(
                    exercise_id=ex_id,
                    exercise_name=data["name"],
                    heaviest_weight=data["heaviest_weight"],
                    best_reps_at_heaviest=data["best_reps_at_heaviest"],
                    best_single_set_volume=data["best_single_set_volume"],
                )
            )

    # Sort: tagged groups alphabetically, untagged last
    sorted_groups = []
    for tag in sorted(k for k in groups if k != "untagged"):
        sorted_groups.append(RecordsGroupOut(tag=tag, records=groups[tag]))
    if "untagged" in groups:
        sorted_groups.append(RecordsGroupOut(tag="untagged", records=groups["untagged"]))

    if debug:
        return _debug_wrap(sorted_groups, _render_sql(q_rows, q_tags))
    return sorted_groups


# ── 1.4  Volume by tag ────────────────────────────────────────────────────────

@router.get("/strength/volume-by-tag", response_model=list[VolumeByTagPoint])
async def strength_volume_by_tag(
    weeks: int = Query(12, ge=1, le=52),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    today = DateType.today()
    current_monday = today - timedelta(days=today.weekday())
    range_start = current_monday - timedelta(weeks=weeks)
    range_start_dt = datetime(range_start.year, range_start.month, range_start.day, tzinfo=timezone.utc)

    query = (
        select(
            WorkoutSession.date,
            ExerciseType.name,
            StrengthSet.weight,
            StrengthSet.reps,
        )
        .join(StrengthSession, StrengthSession.session_id == WorkoutSession.id)
        .join(StrengthExerciseEntry, StrengthExerciseEntry.strength_session_id == StrengthSession.id)
        .join(StrengthSet, StrengthSet.exercise_entry_id == StrengthExerciseEntry.id)
        .join(exercise_exercise_types, exercise_exercise_types.c.exercise_id == StrengthExerciseEntry.exercise_id)
        .join(ExerciseType, ExerciseType.id == exercise_exercise_types.c.exercise_type_id)
        .where(
            WorkoutSession.user_id == user,
            WorkoutSession.date >= range_start_dt,
            StrengthSet.weight.is_not(None),
            StrengthSet.reps.is_not(None),
        )
    )
    rows = (await db.execute(query)).all()

    def week_of(d: datetime) -> DateType:
        dd = d.date() if hasattr(d, "date") else d
        return dd - timedelta(days=dd.weekday())

    volume: dict[tuple[DateType, str], float] = defaultdict(float)
    for row_date, tag_name, weight, reps in rows:
        w = week_of(row_date)
        volume[(w, tag_name)] += weight * reps

    result = [
        VolumeByTagPoint(week_start=w, tag=tag, total_volume=round(vol, 2))
        for (w, tag), vol in sorted(volume.items())
    ]
    if debug:
        return _debug_wrap(result, _render_sql(query))
    return result


# ── 1.5  Cardio time split ────────────────────────────────────────────────────

@router.get("/cardio/time-split", response_model=list[CardioTimeSplitPoint])
async def cardio_time_split(
    period: int = Query(90, ge=1),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    since = datetime.now(timezone.utc) - timedelta(days=period)
    # Use COALESCE so sessions without per-segment activity types fall back to the session-level type.
    eff_at = func.coalesce(CardioSegment.activity_type_id, CardioSession.activity_type_id)

    query = (
        select(CardioActivityType.name, CardioSegment.duration_seconds)
        .select_from(CardioSegment)
        .join(CardioSession, CardioSession.id == CardioSegment.cardio_session_id)
        .join(WorkoutSession, WorkoutSession.id == CardioSession.session_id)
        .join(CardioActivityType, CardioActivityType.id == eff_at)
        .where(
            WorkoutSession.user_id == user,
            WorkoutSession.date >= since,
        )
    )
    rows = (await db.execute(query)).all()

    totals: dict[str, float] = defaultdict(float)
    for name, dur in rows:
        totals[name] += dur / 60.0

    result = [
        CardioTimeSplitPoint(activity_type=name, total_minutes=round(mins, 2))
        for name, mins in sorted(totals.items(), key=lambda x: -x[1])
    ]
    if debug:
        return _debug_wrap(result, _render_sql(query))
    return result


# ── 1.6  Walk segments ────────────────────────────────────────────────────────

@router.get("/cardio/walk-segments", response_model=list[WalkSegmentsPoint])
async def cardio_walk_segments(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    q_sessions = (
        select(WorkoutSession.id, WorkoutSession.date, WorkoutSession.title)
        .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
        .where(WorkoutSession.user_id == user)
        .order_by(WorkoutSession.date)
    )
    sessions_rows = (await db.execute(q_sessions)).all()

    if not sessions_rows:
        return []

    session_ids = [r.id for r in sessions_rows]

    # Use COALESCE so that sessions without per-segment activity types use the session-level type.
    eff_at = func.coalesce(CardioSegment.activity_type_id, CardioSession.activity_type_id)
    q_walk = (
        select(CardioSession.session_id, func.count(CardioSegment.id))
        .select_from(CardioSegment)
        .join(CardioSession, CardioSession.id == CardioSegment.cardio_session_id)
        .join(CardioActivityType, CardioActivityType.id == eff_at)
        .where(
            CardioSession.session_id.in_(session_ids),
            func.lower(CardioActivityType.name) == "walk",
        )
        .group_by(CardioSession.session_id)
    )
    walk_rows = (await db.execute(q_walk)).all()

    walk_counts: dict[int, int] = {sid: count for sid, count in walk_rows}

    result = []
    for sid, row_date, title in sessions_rows:
        d = row_date.date() if hasattr(row_date, "date") else row_date
        result.append(
            WalkSegmentsPoint(
                date=d,
                session_title=title,
                walk_segment_count=walk_counts.get(sid, 0),
            )
        )
    if debug:
        return _debug_wrap(result, _render_sql(q_sessions, q_walk))
    return result


# ── 1.7  Cardio distance progression ─────────────────────────────────────────

@router.get("/cardio/distance-progression", response_model=list[DistanceProgressionPoint])
async def cardio_distance_progression(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    # Use COALESCE so sessions without per-segment activity types use the session-level type.
    eff_at = func.coalesce(CardioSegment.activity_type_id, CardioSession.activity_type_id)
    query = (
        select(
            WorkoutSession.date,
            CardioActivityType.name,
            CardioSegment.distance_meters,
        )
        .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
        .join(CardioSegment, CardioSegment.cardio_session_id == CardioSession.id)
        .join(CardioActivityType, CardioActivityType.id == eff_at)
        .where(
            WorkoutSession.user_id == user,
            CardioSegment.distance_meters.is_not(None),
            CardioSegment.distance_meters > 0,
        )
        .order_by(WorkoutSession.date)
    )
    rows = (await db.execute(query)).all()

    if not rows:
        return []

    # Collect per (activity_type, date) total distances
    by_type_date: dict[str, dict[DateType, float]] = defaultdict(lambda: defaultdict(float))
    for row_date, type_name, dist_m in rows:
        d = row_date.date() if hasattr(row_date, "date") else row_date
        by_type_date[type_name][d] += dist_m

    # Filter out types with no distance (already handled by query)
    # Build rolling monthly cumulative: for each calendar month boundary, sum last 30 days
    today = DateType.today()
    # Find earliest date
    all_dates = [d for dd in by_type_date.values() for d in dd]
    if not all_dates:
        return []

    min_date = min(all_dates)

    # Enumerate month boundaries between min_date and today
    month_starts: list[DateType] = []
    y, m = min_date.year, min_date.month
    while DateType(y, m, 1) <= today:
        month_starts.append(DateType(y, m, 1))
        m += 1
        if m > 12:
            m = 1
            y += 1

    result = []
    for type_name, date_dist in by_type_date.items():
        for ms in month_starts:
            window_end = ms
            window_start = window_end - timedelta(days=30)
            cum_dist = sum(
                dist for d, dist in date_dist.items()
                if window_start < d <= window_end
            )
            if cum_dist > 0:
                result.append(
                    DistanceProgressionPoint(
                        month_start=ms,
                        activity_type=type_name,
                        cumulative_distance_km=round(cum_dist / 1000, 3),
                    )
                )

    result.sort(key=lambda x: (x.month_start, x.activity_type))
    if debug:
        return _debug_wrap(result, _render_sql(query))
    return result


# ── 1.8  Training load ────────────────────────────────────────────────────────

@router.get("/training-load", response_model=list[TrainingLoadWindow])
async def training_load(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    today = DateType.today()
    current_monday = today - timedelta(days=today.weekday())
    # We need 8+1 weeks of data
    range_start = current_monday - timedelta(weeks=52)
    range_start_dt = datetime(range_start.year, range_start.month, range_start.day, tzinfo=timezone.utc)

    q_cardio = (
        select(WorkoutSession.date, CardioSession.total_duration_seconds)
        .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
        .where(WorkoutSession.user_id == user, WorkoutSession.date >= range_start_dt)
    )
    q_cardio_dist = (
        select(WorkoutSession.date, CardioSegment.distance_meters)
        .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
        .join(CardioSegment, CardioSegment.cardio_session_id == CardioSession.id)
        .where(WorkoutSession.user_id == user, WorkoutSession.date >= range_start_dt)
    )
    q_strength = (
        select(WorkoutSession.date, StrengthSession.duration_seconds)
        .join(StrengthSession, StrengthSession.session_id == WorkoutSession.id)
        .where(WorkoutSession.user_id == user, WorkoutSession.date >= range_start_dt)
    )

    # Cardio: total duration + distance per week
    cardio_rows = (await db.execute(q_cardio)).all()
    cardio_dist_rows = (await db.execute(q_cardio_dist)).all()
    strength_rows = (await db.execute(q_strength)).all()

    def week_of(d: datetime) -> DateType:
        dd = d.date() if hasattr(d, "date") else d
        return dd - timedelta(days=dd.weekday())

    cardio_secs_by_week: dict[DateType, int] = defaultdict(int)
    for row_date, dur in cardio_rows:
        cardio_secs_by_week[week_of(row_date)] += dur or 0

    dist_by_week: dict[DateType, float] = defaultdict(float)
    for row_date, dist in cardio_dist_rows:
        dist_by_week[week_of(row_date)] += dist or 0.0

    strength_secs_by_week: dict[DateType, int] = defaultdict(int)
    for row_date, dur in strength_rows:
        strength_secs_by_week[week_of(row_date)] += dur or 0

    # All weeks present in data
    all_weeks = sorted(set(list(cardio_secs_by_week.keys()) + list(strength_secs_by_week.keys())))

    def rolling(window_weeks: int) -> list[TrainingLoadPoint]:
        points = []
        for w in all_weeks:
            total_secs = 0
            total_dist = 0.0
            for i in range(window_weeks):
                wk = w - timedelta(weeks=i)
                total_secs += cardio_secs_by_week.get(wk, 0) + strength_secs_by_week.get(wk, 0)
                total_dist += dist_by_week.get(wk, 0.0)
            points.append(
                TrainingLoadPoint(
                    week_start=w,
                    total_minutes=total_secs // 60,
                    total_distance_km=round(total_dist / 1000, 3),
                )
            )
        return points

    result = [
        TrainingLoadWindow(window=4, data=rolling(4)),
        TrainingLoadWindow(window=8, data=rolling(8)),
    ]
    if debug:
        return _debug_wrap(result, _render_sql(q_cardio, q_cardio_dist, q_strength))
    return result


# ── 1.9  Readiness trends ─────────────────────────────────────────────────────

@router.get("/readiness/trends", response_model=list[ReadinessTrendPoint])
async def readiness_trends(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    query = (
        select(WorkoutSession.date, WorkoutSession.wellbeing, WorkoutSession.rpe)
        .where(WorkoutSession.user_id == user)
        .order_by(WorkoutSession.date)
    )
    rows = (await db.execute(query)).all()

    def week_of(d: datetime) -> DateType:
        dd = d.date() if hasattr(d, "date") else d
        return dd - timedelta(days=dd.weekday())

    wellbeing_by_week: dict[DateType, list[int]] = defaultdict(list)
    rpe_by_week: dict[DateType, list[int]] = defaultdict(list)

    for row_date, wellbeing, rpe in rows:
        w = week_of(row_date)
        if wellbeing is not None:
            wellbeing_by_week[w].append(wellbeing)
        if rpe is not None:
            rpe_by_week[w].append(rpe)

    all_weeks = sorted(set(list(wellbeing_by_week.keys()) + list(rpe_by_week.keys())))

    result = [
        ReadinessTrendPoint(
            week_start=w,
            avg_wellbeing=round(sum(wellbeing_by_week[w]) / len(wellbeing_by_week[w]), 2)
            if wellbeing_by_week.get(w)
            else None,
            avg_rpe=round(sum(rpe_by_week[w]) / len(rpe_by_week[w]), 2)
            if rpe_by_week.get(w)
            else None,
        )
        for w in all_weeks
    ]
    if debug:
        return _debug_wrap(result, _render_sql(query))
    return result


# ── 1.10 Readiness correlation ────────────────────────────────────────────────

@router.get("/readiness/correlation", response_model=list[ReadinessCorrelationPoint])
async def readiness_correlation(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    query = (
        select(WorkoutSession.date, WorkoutSession.wellbeing, WorkoutSession.rpe, WorkoutSession.type)
        .where(
            WorkoutSession.user_id == user,
            WorkoutSession.wellbeing.is_not(None),
            WorkoutSession.rpe.is_not(None),
        )
        .order_by(WorkoutSession.date)
    )
    rows = (await db.execute(query)).all()

    result = [
        ReadinessCorrelationPoint(
            date=(row_date.date() if hasattr(row_date, "date") else row_date),
            wellbeing=wellbeing,
            rpe=rpe,
            type=session_type,
        )
        for row_date, wellbeing, rpe, session_type in rows
    ]
    if debug:
        return _debug_wrap(result, _render_sql(query))
    return result


# ── 1.11 Heatmap ──────────────────────────────────────────────────────────────

@router.get("/heatmap", response_model=list[HeatmapDay])
async def heatmap(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    today = DateType.today()
    since = today - timedelta(days=364)
    since_dt = datetime(since.year, since.month, since.day, tzinfo=timezone.utc)

    query = (
        select(WorkoutSession.date, WorkoutSession.type)
        .where(WorkoutSession.user_id == user, WorkoutSession.date >= since_dt)
        .order_by(WorkoutSession.date)
    )
    rows = (await db.execute(query)).all()

    by_date: dict[DateType, set[str]] = defaultdict(set)
    for row_date, session_type in rows:
        d = row_date.date() if hasattr(row_date, "date") else row_date
        by_date[d].add(session_type)

    result = [
        HeatmapDay(date=d, session_types=sorted(types))
        for d, types in sorted(by_date.items())
    ]
    if debug:
        return _debug_wrap(result, _render_sql(query))
    return result


# ── 2.1  Overview trends ──────────────────────────────────────────────────────

@router.get("/overview-trends", response_model=list[OverviewTrendsPoint])
async def overview_trends(
    weeks: int = Query(12, ge=1, le=52),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    today = DateType.today()
    current_monday = today - timedelta(days=today.weekday())
    range_start = current_monday - timedelta(weeks=weeks)
    range_start_dt = datetime(range_start.year, range_start.month, range_start.day, tzinfo=timezone.utc)

    q_sessions = (
        select(WorkoutSession.date)
        .where(WorkoutSession.user_id == user, WorkoutSession.date >= range_start_dt)
    )
    q_strength_dur = (
        select(WorkoutSession.date, StrengthSession.duration_seconds)
        .join(StrengthSession, StrengthSession.session_id == WorkoutSession.id)
        .where(WorkoutSession.user_id == user, WorkoutSession.date >= range_start_dt)
    )
    q_cardio_dur = (
        select(WorkoutSession.date, CardioSession.total_duration_seconds)
        .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
        .where(WorkoutSession.user_id == user, WorkoutSession.date >= range_start_dt)
    )
    q_volume = (
        select(WorkoutSession.date, StrengthSet.weight, StrengthSet.reps)
        .join(StrengthSession, StrengthSession.session_id == WorkoutSession.id)
        .join(StrengthExerciseEntry, StrengthExerciseEntry.strength_session_id == StrengthSession.id)
        .join(StrengthSet, StrengthSet.exercise_entry_id == StrengthExerciseEntry.id)
        .where(
            WorkoutSession.user_id == user,
            WorkoutSession.date >= range_start_dt,
            StrengthSet.weight.is_not(None),
            StrengthSet.reps.is_not(None),
        )
    )

    session_dates = (await db.execute(q_sessions)).scalars().all()
    strength_dur_rows = (await db.execute(q_strength_dur)).all()
    cardio_dur_rows = (await db.execute(q_cardio_dur)).all()
    volume_rows = (await db.execute(q_volume)).all()

    def week_of(d: datetime) -> DateType:
        dd = d.date() if hasattr(d, "date") else d
        return dd - timedelta(days=dd.weekday())

    count_by_week: dict[DateType, int] = defaultdict(int)
    for row_date in session_dates:
        count_by_week[week_of(row_date)] += 1

    secs_by_week: dict[DateType, int] = defaultdict(int)
    for row_date, dur in strength_dur_rows:
        secs_by_week[week_of(row_date)] += dur or 0
    for row_date, dur in cardio_dur_rows:
        secs_by_week[week_of(row_date)] += dur or 0

    vol_by_week: dict[DateType, float] = defaultdict(float)
    for row_date, weight, reps in volume_rows:
        vol_by_week[week_of(row_date)] += weight * reps

    # All weeks in range (range_start through current_monday inclusive)
    all_weeks: set[DateType] = set()
    w = range_start
    while w <= current_monday:
        all_weeks.add(w)
        w += timedelta(weeks=1)

    result = [
        OverviewTrendsPoint(
            week_start=w,
            session_count=count_by_week.get(w, 0),
            total_minutes=secs_by_week.get(w, 0) // 60,
            total_volume=round(vol_by_week.get(w, 0.0), 2),
        )
        for w in sorted(all_weeks)
    ]
    if debug:
        return _debug_wrap(result, _render_sql(q_sessions, q_strength_dur, q_cardio_dur, q_volume))
    return result


# ── 2.2  Weekly exercises by type ─────────────────────────────────────────────

@router.get("/strength/exercises-by-type", response_model=list[ExercisesByTypePoint])
async def strength_exercises_by_type(
    weeks: int = Query(12, ge=1, le=52),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    today = DateType.today()
    current_monday = today - timedelta(days=today.weekday())
    range_start = current_monday - timedelta(weeks=weeks)
    range_start_dt = datetime(range_start.year, range_start.month, range_start.day, tzinfo=timezone.utc)

    query = (
        select(
            WorkoutSession.date,
            ExerciseType.name,
            StrengthExerciseEntry.exercise_id,
        )
        .join(StrengthSession, StrengthSession.session_id == WorkoutSession.id)
        .join(StrengthExerciseEntry, StrengthExerciseEntry.strength_session_id == StrengthSession.id)
        .join(exercise_exercise_types, exercise_exercise_types.c.exercise_id == StrengthExerciseEntry.exercise_id)
        .join(ExerciseType, ExerciseType.id == exercise_exercise_types.c.exercise_type_id)
        .where(
            WorkoutSession.user_id == user,
            WorkoutSession.date >= range_start_dt,
        )
    )
    rows = (await db.execute(query)).all()

    def week_of(d: datetime) -> DateType:
        dd = d.date() if hasattr(d, "date") else d
        return dd - timedelta(days=dd.weekday())

    by_week_tag: dict[tuple[DateType, str], set[int]] = defaultdict(set)
    for row_date, tag_name, exercise_id in rows:
        by_week_tag[(week_of(row_date), tag_name)].add(exercise_id)

    result = [
        ExercisesByTypePoint(week_start=w, muscle_group_tag=tag, exercise_count=len(ex_ids))
        for (w, tag), ex_ids in sorted(by_week_tag.items())
    ]
    if debug:
        return _debug_wrap(result, _render_sql(query))
    return result


# ── 2.4  Plan adherence trends ────────────────────────────────────────────────

@router.get("/plan-adherence", response_model=list[PlanAdherencePoint])
async def plan_adherence(
    weeks: int = Query(12, ge=1, le=52),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    from app.models.plan import PlannedCardioSegment, PlannedSession, WeeklyPlan
    from app.models.template import StrengthTemplateExercise, StrengthTemplateSet

    today = DateType.today()
    current_monday = today - timedelta(days=today.weekday())
    # Only include fully complete past weeks (exclude current in-progress week)
    range_start = current_monday - timedelta(weeks=weeks)
    range_start_dt = datetime(range_start.year, range_start.month, range_start.day, tzinfo=timezone.utc)

    # Load all planned sessions for the range with aggregated planned cardio totals
    q_planned = (
        select(
            WeeklyPlan.week_start,
            PlannedSession.id,
            PlannedSession.planned_date,
            PlannedSession.session_type,
            PlannedSession.template_id,
            PlannedSession.activity_type_id,
            func.coalesce(func.sum(PlannedCardioSegment.distance_metres), 0).label("planned_dist_m"),
            func.coalesce(func.sum(PlannedCardioSegment.duration_secs), 0).label("planned_dur_s"),
        )
        .join(PlannedSession, PlannedSession.plan_id == WeeklyPlan.id)
        .outerjoin(PlannedCardioSegment, PlannedCardioSegment.planned_session_id == PlannedSession.id)
        .where(
            WeeklyPlan.user_id == user,
            WeeklyPlan.week_start >= range_start,
            WeeklyPlan.week_start < current_monday,
        )
        .group_by(WeeklyPlan.week_start, PlannedSession.id)
    )
    planned_rows = (await db.execute(q_planned)).all()

    # Load template volumes for all planned strength sessions
    template_ids = list({row.template_id for row in planned_rows if row.session_type == "strength" and row.template_id is not None})
    tmpl_vol: dict[int, float] = defaultdict(float)
    if template_ids:
        q_tmpl = (
            select(
                StrengthTemplateExercise.template_id,
                StrengthTemplateSet.weight_kg,
                StrengthTemplateSet.reps,
            )
            .join(StrengthTemplateSet, StrengthTemplateSet.exercise_entry_id == StrengthTemplateExercise.id)
            .where(
                StrengthTemplateExercise.template_id.in_(template_ids),
                StrengthTemplateSet.weight_kg.is_not(None),
                StrengthTemplateSet.reps.is_not(None),
            )
        )
        for tmpl_id, w_kg, reps in (await db.execute(q_tmpl)).all():
            tmpl_vol[tmpl_id] += w_kg * reps

    # Batch-load logged strength sessions in range: (date, template_id) -> ws_id
    q_logged_str = (
        select(WorkoutSession.date, WorkoutSession.id, StrengthSession.template_id)
        .join(StrengthSession, StrengthSession.session_id == WorkoutSession.id)
        .where(WorkoutSession.user_id == user, WorkoutSession.date >= range_start_dt)
    )
    str_done: dict[tuple[DateType, int], int] = {}
    for row_date, ws_id, tmpl_id in (await db.execute(q_logged_str)).all():
        d = row_date.date() if hasattr(row_date, "date") else row_date
        if tmpl_id is not None:
            str_done[(d, tmpl_id)] = ws_id

    # Batch-load logged cardio sessions in range: (date, activity_type_id) -> ws_id
    q_logged_cardio = (
        select(WorkoutSession.date, WorkoutSession.id, CardioSession.activity_type_id)
        .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
        .where(WorkoutSession.user_id == user, WorkoutSession.date >= range_start_dt)
    )
    cardio_done: dict[tuple[DateType, int], int] = {}
    for row_date, ws_id, at_id in (await db.execute(q_logged_cardio)).all():
        d = row_date.date() if hasattr(row_date, "date") else row_date
        if at_id is not None:
            cardio_done[(d, at_id)] = ws_id

    # Determine matched ws_ids
    matched_str_ws_ids: set[int] = set()
    matched_cardio_ws_ids: set[int] = set()
    for row in planned_rows:
        pd = row.planned_date
        if row.session_type == "strength" and row.template_id is not None:
            ws_id = str_done.get((pd, row.template_id))
            if ws_id:
                matched_str_ws_ids.add(ws_id)
        elif row.session_type == "cardio" and row.activity_type_id is not None:
            ws_id = cardio_done.get((pd, row.activity_type_id))
            if ws_id:
                matched_cardio_ws_ids.add(ws_id)

    # Load actual strength volumes for matched sessions
    actual_str_vol_by_ws: dict[int, float] = defaultdict(float)
    if matched_str_ws_ids:
        q_actual_str = (
            select(StrengthSession.session_id, StrengthSet.weight, StrengthSet.reps)
            .join(StrengthExerciseEntry, StrengthExerciseEntry.strength_session_id == StrengthSession.id)
            .join(StrengthSet, StrengthSet.exercise_entry_id == StrengthExerciseEntry.id)
            .where(
                StrengthSession.session_id.in_(matched_str_ws_ids),
                StrengthSet.weight.is_not(None),
                StrengthSet.reps.is_not(None),
            )
        )
        for ws_id, w, r in (await db.execute(q_actual_str)).all():
            actual_str_vol_by_ws[ws_id] += w * r

    # Load actual cardio distances for matched sessions
    actual_cardio_dist_by_ws: dict[int, float] = defaultdict(float)
    if matched_cardio_ws_ids:
        q_actual_cardio = (
            select(CardioSession.session_id, func.sum(CardioSegment.distance_meters))
            .join(CardioSegment, CardioSegment.cardio_session_id == CardioSession.id)
            .where(
                CardioSession.session_id.in_(matched_cardio_ws_ids),
                CardioSegment.distance_meters.is_not(None),
            )
            .group_by(CardioSession.session_id)
        )
        for ws_id, total_dist in (await db.execute(q_actual_cardio)).all():
            actual_cardio_dist_by_ws[ws_id] = total_dist or 0.0

    # Aggregate per week
    by_week: dict[DateType, dict] = {
        range_start + timedelta(weeks=i): {
            "done": 0, "skipped": 0,
            "planned_str_vol": 0.0, "actual_str_vol": 0.0,
            "planned_cardio_dist_m": 0.0, "actual_cardio_dist_m": 0.0,
        }
        for i in range(weeks)
    }

    for row in planned_rows:
        ws = row.week_start
        if ws not in by_week:
            continue
        pd = row.planned_date
        ws_id = None
        if row.session_type == "strength" and row.template_id is not None:
            ws_id = str_done.get((pd, row.template_id))
        elif row.session_type == "cardio" and row.activity_type_id is not None:
            ws_id = cardio_done.get((pd, row.activity_type_id))

        if ws_id is not None:
            status = "done"
        elif pd >= today:
            status = "planned"
        else:
            status = "skipped"

        if status == "done":
            by_week[ws]["done"] += 1
        elif status == "skipped":
            by_week[ws]["skipped"] += 1

        # Planned totals (all sessions regardless of status)
        if row.session_type == "strength" and row.template_id is not None:
            by_week[ws]["planned_str_vol"] += tmpl_vol.get(row.template_id, 0.0)
        elif row.session_type == "cardio":
            by_week[ws]["planned_cardio_dist_m"] += row.planned_dist_m or 0.0

        # Actual totals (done sessions only)
        if ws_id is not None:
            if row.session_type == "strength":
                by_week[ws]["actual_str_vol"] += actual_str_vol_by_ws.get(ws_id, 0.0)
            elif row.session_type == "cardio":
                by_week[ws]["actual_cardio_dist_m"] += actual_cardio_dist_by_ws.get(ws_id, 0.0)

    result = []
    for w_start in sorted(by_week.keys()):
        d = by_week[w_start]
        total = d["done"] + d["skipped"]
        completion_pct = round(d["done"] / total * 100, 1) if total > 0 else None

        has_str = d["planned_str_vol"] > 0
        has_cardio = d["planned_cardio_dist_m"] > 0

        result.append(PlanAdherencePoint(
            week_start=w_start,
            completion_pct=completion_pct,
            strength_volume_delta=round(d["actual_str_vol"] - d["planned_str_vol"], 2) if has_str else None,
            cardio_distance_delta=round((d["actual_cardio_dist_m"] - d["planned_cardio_dist_m"]) / 1000, 3) if has_cardio else None,
        ))

    if debug:
        return _debug_wrap(result, _render_sql(q_planned, q_logged_str, q_logged_cardio))
    return result


# ── 2.5  HR zone trends ───────────────────────────────────────────────────────

@router.get("/cardio/hr-zone-trends", response_model=list[HrZoneTrendsRow])
async def hr_zone_trends(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    debug: bool = Query(False),
):
    today = DateType.today()
    current_monday = today - timedelta(days=today.weekday())
    range_start = current_monday - timedelta(weeks=12)
    range_start_dt = datetime(range_start.year, range_start.month, range_start.day, tzinfo=timezone.utc)

    query = (
        select(
            WorkoutSession.date,
            WorkoutSession.z1_seconds,
            WorkoutSession.z2_seconds,
            WorkoutSession.z3_seconds,
            WorkoutSession.z4_seconds,
            WorkoutSession.z5_seconds,
        )
        .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.user_id == user,
            WorkoutSession.date >= range_start_dt,
        )
    )
    rows = (await db.execute(query)).all()

    def week_of(d) -> DateType:
        dd = d.date() if hasattr(d, "date") else d
        return dd - timedelta(days=dd.weekday())

    secs: dict[DateType, list[int]] = defaultdict(lambda: [0, 0, 0, 0, 0])
    for row_date, z1, z2, z3, z4, z5 in rows:
        w = week_of(row_date)
        zone_vals = secs[w]
        zone_vals[0] += z1 or 0
        zone_vals[1] += z2 or 0
        zone_vals[2] += z3 or 0
        zone_vals[3] += z4 or 0
        zone_vals[4] += z5 or 0

    # Build all 13 weeks (range_start through current_monday inclusive)
    result = []
    w = range_start
    while w <= current_monday:
        zone_vals = secs.get(w, [0, 0, 0, 0, 0])
        result.append(HrZoneTrendsRow(
            week_start=w,
            z1_minutes=round(zone_vals[0] / 60, 1),
            z2_minutes=round(zone_vals[1] / 60, 1),
            z3_minutes=round(zone_vals[2] / 60, 1),
            z4_minutes=round(zone_vals[3] / 60, 1),
            z5_minutes=round(zone_vals[4] / 60, 1),
        ))
        w += timedelta(weeks=1)

    if debug:
        return _debug_wrap(result, _render_sql(query))
    return result


# ── Health metrics ────────────────────────────────────────────────────────────

@router.get("/health-metrics", response_model=list[HealthMetricsPoint])
async def health_metrics(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(90, ge=0),
):
    settings = await db.get(UserSettings, user)
    prefs = settings or UserSettings()

    query = select(BodyMetrics)
    if days > 0:
        cutoff = DateType.today() - timedelta(days=days)
        query = query.where(BodyMetrics.date >= cutoff)
    query = query.order_by(BodyMetrics.date)

    rows = (await db.execute(query)).scalars().all()

    return [
        HealthMetricsPoint(
            date=row.date,
            resting_hr_bpm=row.resting_hr_bpm if prefs.health_metric_resting_hr else None,
            hrv_sdnn_ms=row.hrv_sdnn_ms if prefs.health_metric_hrv else None,
            weight_kg=row.weight_kg if prefs.health_metric_weight else None,
            sleep_duration_seconds=row.sleep_duration_seconds if prefs.health_metric_sleep else None,
            vo2_max=row.vo2_max if prefs.health_metric_vo2_max else None,
            active_energy_kcal=row.active_energy_kcal if prefs.health_metric_active_energy else None,
        )
        for row in rows
    ]
