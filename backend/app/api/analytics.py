from __future__ import annotations

from collections import defaultdict
from datetime import date as DateType
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
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
from app.schemas.analytics import (
    CardioTimeSplitPoint,
    DistanceProgressionPoint,
    HeatmapDay,
    PersonalRecord,
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


# ── 1.1  Summary ─────────────────────────────────────────────────────────────

@router.get("/summary", response_model=SummaryOut)
async def get_summary(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SummaryOut:
    # Total sessions
    total_sessions_result = await db.execute(
        select(func.count(WorkoutSession.id)).where(WorkoutSession.user_id == user)
    )
    total_sessions = total_sessions_result.scalar_one() or 0

    # Strength minutes
    strength_result = await db.execute(
        select(func.sum(StrengthSession.duration_seconds))
        .join(WorkoutSession, WorkoutSession.id == StrengthSession.session_id)
        .where(WorkoutSession.user_id == user)
    )
    strength_seconds = strength_result.scalar_one() or 0

    # Cardio minutes
    cardio_result = await db.execute(
        select(func.sum(CardioSession.total_duration_seconds))
        .join(WorkoutSession, WorkoutSession.id == CardioSession.session_id)
        .where(WorkoutSession.user_id == user)
    )
    cardio_seconds = cardio_result.scalar_one() or 0

    total_minutes = (strength_seconds + cardio_seconds) // 60

    # Total cardio distance (from segments)
    dist_result = await db.execute(
        select(func.sum(CardioSegment.distance_meters))
        .join(CardioSession, CardioSession.id == CardioSegment.cardio_session_id)
        .join(WorkoutSession, WorkoutSession.id == CardioSession.session_id)
        .where(WorkoutSession.user_id == user)
    )
    total_distance_m = dist_result.scalar_one() or 0.0
    total_distance_km = round(total_distance_m / 1000, 2)

    return SummaryOut(
        total_sessions=total_sessions,
        total_minutes=total_minutes,
        total_distance_km=total_distance_km,
    )


# ── 1.2  Strength progression ─────────────────────────────────────────────────

@router.get("/strength/progression", response_model=list[StrengthProgressionPoint])
async def strength_progression(
    exercise_id: int = Query(...),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[StrengthProgressionPoint]:
    rows = (
        await db.execute(
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
    ).all()

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

    return result


# ── 1.3  Personal records ─────────────────────────────────────────────────────

@router.get("/strength/records", response_model=list[RecordsGroupOut])
async def strength_records(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[RecordsGroupOut]:
    # Fetch all sets for user's strength sessions, with exercise and types
    rows = (
        await db.execute(
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
    ).all()

    # Fetch exercise → type tags mapping
    tag_rows = (
        await db.execute(
            select(exercise_exercise_types.c.exercise_id, ExerciseType.name)
            .join(ExerciseType, ExerciseType.id == exercise_exercise_types.c.exercise_type_id)
            .join(Exercise, Exercise.id == exercise_exercise_types.c.exercise_id)
            .where(Exercise.user_id == user)
        )
    ).all()

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

    return sorted_groups


# ── 1.4  Volume by tag ────────────────────────────────────────────────────────

@router.get("/strength/volume-by-tag", response_model=list[VolumeByTagPoint])
async def strength_volume_by_tag(
    weeks: int = Query(12, ge=1, le=52),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[VolumeByTagPoint]:
    today = DateType.today()
    current_monday = today - timedelta(days=today.weekday())
    range_start = current_monday - timedelta(weeks=weeks)
    range_start_dt = datetime(range_start.year, range_start.month, range_start.day, tzinfo=timezone.utc)

    rows = (
        await db.execute(
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
    ).all()

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
    return result


# ── 1.5  Cardio time split ────────────────────────────────────────────────────

@router.get("/cardio/time-split", response_model=list[CardioTimeSplitPoint])
async def cardio_time_split(
    period: int = Query(90, ge=1),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CardioTimeSplitPoint]:
    since = datetime.now(timezone.utc) - timedelta(days=period)

    rows = (
        await db.execute(
            select(CardioActivityType.name, CardioSegment.duration_seconds)
            .join(CardioSession, CardioSession.id == CardioSegment.cardio_session_id)
            .join(WorkoutSession, WorkoutSession.id == CardioSession.session_id)
            .join(CardioActivityType, CardioActivityType.id == CardioSegment.activity_type_id)
            .where(
                WorkoutSession.user_id == user,
                WorkoutSession.date >= since,
                CardioSegment.activity_type_id.is_not(None),
            )
        )
    ).all()

    totals: dict[str, float] = defaultdict(float)
    for name, dur in rows:
        totals[name] += dur / 60.0

    return [
        CardioTimeSplitPoint(activity_type=name, total_minutes=round(mins, 2))
        for name, mins in sorted(totals.items(), key=lambda x: -x[1])
    ]


# ── 1.6  Walk segments ────────────────────────────────────────────────────────

@router.get("/cardio/walk-segments", response_model=list[WalkSegmentsPoint])
async def cardio_walk_segments(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[WalkSegmentsPoint]:
    # Get all cardio sessions
    sessions_rows = (
        await db.execute(
            select(WorkoutSession.id, WorkoutSession.date, WorkoutSession.title)
            .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
            .where(WorkoutSession.user_id == user)
            .order_by(WorkoutSession.date)
        )
    ).all()

    if not sessions_rows:
        return []

    session_ids = [r.id for r in sessions_rows]
    session_map = {r.id: r for r in sessions_rows}

    # Get walk segment counts per session
    walk_rows = (
        await db.execute(
            select(CardioSession.session_id, func.count(CardioSegment.id))
            .join(CardioSegment, CardioSegment.cardio_session_id == CardioSession.id)
            .join(CardioActivityType, CardioActivityType.id == CardioSegment.activity_type_id)
            .where(
                CardioSession.session_id.in_(session_ids),
                func.lower(CardioActivityType.name) == "walk",
            )
            .group_by(CardioSession.session_id)
        )
    ).all()

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
    return result


# ── 1.7  Cardio distance progression ─────────────────────────────────────────

@router.get("/cardio/distance-progression", response_model=list[DistanceProgressionPoint])
async def cardio_distance_progression(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DistanceProgressionPoint]:
    rows = (
        await db.execute(
            select(
                WorkoutSession.date,
                CardioActivityType.name,
                CardioSegment.distance_meters,
            )
            .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
            .join(CardioSegment, CardioSegment.cardio_session_id == CardioSession.id)
            .join(CardioActivityType, CardioActivityType.id == CardioSegment.activity_type_id)
            .where(
                WorkoutSession.user_id == user,
                CardioSegment.distance_meters.is_not(None),
                CardioSegment.distance_meters > 0,
                CardioSegment.activity_type_id.is_not(None),
            )
            .order_by(WorkoutSession.date)
        )
    ).all()

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
    return result


# ── 1.8  Training load ────────────────────────────────────────────────────────

@router.get("/training-load", response_model=list[TrainingLoadWindow])
async def training_load(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TrainingLoadWindow]:
    today = DateType.today()
    current_monday = today - timedelta(days=today.weekday())
    # We need 8+1 weeks of data
    range_start = current_monday - timedelta(weeks=52)
    range_start_dt = datetime(range_start.year, range_start.month, range_start.day, tzinfo=timezone.utc)

    # Cardio: total duration + distance per week
    cardio_rows = (
        await db.execute(
            select(WorkoutSession.date, CardioSession.total_duration_seconds)
            .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
            .where(WorkoutSession.user_id == user, WorkoutSession.date >= range_start_dt)
        )
    ).all()

    cardio_dist_rows = (
        await db.execute(
            select(WorkoutSession.date, CardioSegment.distance_meters)
            .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
            .join(CardioSegment, CardioSegment.cardio_session_id == CardioSession.id)
            .where(WorkoutSession.user_id == user, WorkoutSession.date >= range_start_dt)
        )
    ).all()

    strength_rows = (
        await db.execute(
            select(WorkoutSession.date, StrengthSession.duration_seconds)
            .join(StrengthSession, StrengthSession.session_id == WorkoutSession.id)
            .where(WorkoutSession.user_id == user, WorkoutSession.date >= range_start_dt)
        )
    ).all()

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

    return [
        TrainingLoadWindow(window=4, data=rolling(4)),
        TrainingLoadWindow(window=8, data=rolling(8)),
    ]


# ── 1.9  Readiness trends ─────────────────────────────────────────────────────

@router.get("/readiness/trends", response_model=list[ReadinessTrendPoint])
async def readiness_trends(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ReadinessTrendPoint]:
    rows = (
        await db.execute(
            select(WorkoutSession.date, WorkoutSession.wellbeing, WorkoutSession.rpe)
            .where(WorkoutSession.user_id == user)
            .order_by(WorkoutSession.date)
        )
    ).all()

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

    return [
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


# ── 1.10 Readiness correlation ────────────────────────────────────────────────

@router.get("/readiness/correlation", response_model=list[ReadinessCorrelationPoint])
async def readiness_correlation(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ReadinessCorrelationPoint]:
    rows = (
        await db.execute(
            select(WorkoutSession.date, WorkoutSession.wellbeing, WorkoutSession.rpe, WorkoutSession.type)
            .where(
                WorkoutSession.user_id == user,
                WorkoutSession.wellbeing.is_not(None),
                WorkoutSession.rpe.is_not(None),
            )
            .order_by(WorkoutSession.date)
        )
    ).all()

    return [
        ReadinessCorrelationPoint(
            date=(row_date.date() if hasattr(row_date, "date") else row_date),
            wellbeing=wellbeing,
            rpe=rpe,
            type=session_type,
        )
        for row_date, wellbeing, rpe, session_type in rows
    ]


# ── 1.11 Heatmap ──────────────────────────────────────────────────────────────

@router.get("/heatmap", response_model=list[HeatmapDay])
async def heatmap(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[HeatmapDay]:
    today = DateType.today()
    since = today - timedelta(days=364)
    since_dt = datetime(since.year, since.month, since.day, tzinfo=timezone.utc)

    rows = (
        await db.execute(
            select(WorkoutSession.date, WorkoutSession.type)
            .where(WorkoutSession.user_id == user, WorkoutSession.date >= since_dt)
            .order_by(WorkoutSession.date)
        )
    ).all()

    by_date: dict[DateType, set[str]] = defaultdict(set)
    for row_date, session_type in rows:
        d = row_date.date() if hasattr(row_date, "date") else row_date
        by_date[d].add(session_type)

    return [
        HeatmapDay(date=d, session_types=sorted(types))
        for d, types in sorted(by_date.items())
    ]
