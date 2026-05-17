from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.plan import PlannedSession, WeeklyPlan
from app.models.session import (
    CardioSegment,
    CardioSession,
    StrengthExerciseEntry,
    StrengthSession,
    StrengthSet,
    WorkoutSession,
)
from app.models.template import (
    StrengthTemplateExercise,
    StrengthTemplateHistory,
    StrengthTemplateHistoryExercise,
    StrengthTemplateSet,
)
from app.schemas.plan import (
    CardioComparisonOut,
    ExerciseComparison,
    SessionComparisonOut,
    SetComparisonRow,
    StrengthComparisonOut,
    WeeklySummaryOut,
    WeeklySummaryTotals,
)

router = APIRouter(prefix="/plan", tags=["plan-summary"])


async def _load_week_plan(db: AsyncSession, user: str, ws_date: date) -> WeeklyPlan | None:
    result = await db.execute(
        select(WeeklyPlan)
        .where(WeeklyPlan.user_id == user, WeeklyPlan.week_start == ws_date)
        .options(selectinload(WeeklyPlan.sessions).selectinload(PlannedSession.cardio_segments))
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


# ── GET /plan/weekly-summary ──────────────────────────────────────────────────

@router.get("/weekly-summary", response_model=WeeklySummaryOut)
async def plan_weekly_summary(
    week_start: str = Query(...),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WeeklySummaryOut:
    try:
        ws_date = date.fromisoformat(week_start)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format; expected YYYY-MM-DD")
    if ws_date.weekday() != 0:
        raise HTTPException(status_code=400, detail="week_start must be a Monday")

    zeros = WeeklySummaryTotals(
        cardio_distance_km=0.0,
        cardio_duration_min=0.0,
        strength_exercise_count=0,
        strength_volume_kg_reps=0.0,
    )

    plan = await _load_week_plan(db, user, ws_date)
    if plan is None or not plan.sessions:
        return WeeklySummaryOut(planned=zeros, actual=zeros)

    ws_start_dt = datetime(ws_date.year, ws_date.month, ws_date.day, tzinfo=timezone.utc)
    ws_end_dt = ws_start_dt + timedelta(days=7)

    # Batch-load logged sessions for the week to determine done/skipped status
    q_logged_str = (
        select(WorkoutSession.date, WorkoutSession.id, StrengthSession.template_id)
        .join(StrengthSession, StrengthSession.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.user_id == user,
            WorkoutSession.date >= ws_start_dt,
            WorkoutSession.date < ws_end_dt,
        )
    )
    str_done: dict[tuple[date, int], int] = {}
    for row_date, ws_id, tmpl_id in (await db.execute(q_logged_str)).all():
        d = row_date.date() if hasattr(row_date, "date") else row_date
        if tmpl_id is not None:
            str_done[(d, tmpl_id)] = ws_id

    q_logged_cardio = (
        select(WorkoutSession.date, WorkoutSession.id, CardioSession.activity_type_id)
        .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.user_id == user,
            WorkoutSession.date >= ws_start_dt,
            WorkoutSession.date < ws_end_dt,
        )
    )
    cardio_done: dict[tuple[date, int], int] = {}
    for row_date, ws_id, at_id in (await db.execute(q_logged_cardio)).all():
        d = row_date.date() if hasattr(row_date, "date") else row_date
        if at_id is not None:
            cardio_done[(d, at_id)] = ws_id

    # Determine matched (done) session ids
    matched_str_ws_ids: list[int] = []
    matched_cardio_ws_ids: list[int] = []
    for ps in plan.sessions:
        pd = ps.planned_date
        if ps.session_type == "strength" and ps.template_id is not None:
            ws_id = str_done.get((pd, ps.template_id))
            if ws_id:
                matched_str_ws_ids.append(ws_id)
        elif ps.session_type == "cardio" and ps.activity_type_id is not None:
            ws_id = cardio_done.get((pd, ps.activity_type_id))
            if ws_id:
                matched_cardio_ws_ids.append(ws_id)

    # ── Planned totals ────────────────────────────────────────────────────────

    # Cardio: sum from planned segments (already loaded via selectinload)
    planned_cardio_dist_m = 0.0
    planned_cardio_dur_s = 0.0
    for ps in plan.sessions:
        if ps.session_type == "cardio":
            for seg in ps.cardio_segments:
                planned_cardio_dist_m += seg.distance_metres or 0
                planned_cardio_dur_s += seg.duration_secs or 0

    # Strength: load template exercises + sets
    planned_str_template_ids = [ps.template_id for ps in plan.sessions if ps.session_type == "strength" and ps.template_id is not None]
    planned_str_vol = 0.0
    planned_str_ex_count = 0
    if planned_str_template_ids:
        unique_tmpl_ids = list(set(planned_str_template_ids))
        q_tmpl = (
            select(
                StrengthTemplateExercise.template_id,
                StrengthTemplateSet.weight_kg,
                StrengthTemplateSet.reps,
            )
            .join(StrengthTemplateSet, StrengthTemplateSet.exercise_entry_id == StrengthTemplateExercise.id)
            .where(
                StrengthTemplateExercise.template_id.in_(unique_tmpl_ids),
                StrengthTemplateSet.weight_kg.is_not(None),
                StrengthTemplateSet.reps.is_not(None),
            )
        )
        q_tmpl_ex = (
            select(StrengthTemplateExercise.template_id, func.count(StrengthTemplateExercise.id))
            .where(StrengthTemplateExercise.template_id.in_(unique_tmpl_ids))
            .group_by(StrengthTemplateExercise.template_id)
        )
        tmpl_vol: dict[int, float] = {}
        for tmpl_id, w_kg, reps in (await db.execute(q_tmpl)).all():
            tmpl_vol[tmpl_id] = tmpl_vol.get(tmpl_id, 0.0) + w_kg * reps

        tmpl_ex_count: dict[int, int] = dict((await db.execute(q_tmpl_ex)).all())

        for tmpl_id in planned_str_template_ids:
            planned_str_vol += tmpl_vol.get(tmpl_id, 0.0)
            planned_str_ex_count += tmpl_ex_count.get(tmpl_id, 0)

    # ── Actual totals (done sessions only) ────────────────────────────────────

    actual_str_vol = 0.0
    actual_str_ex_count = 0
    if matched_str_ws_ids:
        q_actual_str_vol = (
            select(func.sum(func.coalesce(StrengthSet.weight, 0) * func.coalesce(StrengthSet.reps, 0)))
            .join(StrengthExerciseEntry, StrengthExerciseEntry.id == StrengthSet.exercise_entry_id)
            .join(StrengthSession, StrengthSession.id == StrengthExerciseEntry.strength_session_id)
            .where(
                StrengthSession.session_id.in_(matched_str_ws_ids),
                StrengthSet.weight.is_not(None),
                StrengthSet.reps.is_not(None),
            )
        )
        q_actual_str_ex = (
            select(func.count(StrengthExerciseEntry.id))
            .join(StrengthSession, StrengthSession.id == StrengthExerciseEntry.strength_session_id)
            .where(StrengthSession.session_id.in_(matched_str_ws_ids))
        )
        actual_str_vol = (await db.execute(q_actual_str_vol)).scalar_one() or 0.0
        actual_str_ex_count = (await db.execute(q_actual_str_ex)).scalar_one() or 0

    actual_cardio_dist_m = 0.0
    actual_cardio_dur_s = 0.0
    if matched_cardio_ws_ids:
        q_actual_dist = (
            select(func.sum(CardioSegment.distance_meters))
            .join(CardioSession, CardioSession.id == CardioSegment.cardio_session_id)
            .where(
                CardioSession.session_id.in_(matched_cardio_ws_ids),
                CardioSegment.distance_meters.is_not(None),
            )
        )
        q_actual_dur = (
            select(func.sum(CardioSession.total_duration_seconds))
            .where(CardioSession.session_id.in_(matched_cardio_ws_ids))
        )
        actual_cardio_dist_m = (await db.execute(q_actual_dist)).scalar_one() or 0.0
        actual_cardio_dur_s = (await db.execute(q_actual_dur)).scalar_one() or 0.0

    planned = WeeklySummaryTotals(
        cardio_distance_km=round(planned_cardio_dist_m / 1000, 3),
        cardio_duration_min=round(planned_cardio_dur_s / 60, 1),
        strength_exercise_count=planned_str_ex_count,
        strength_volume_kg_reps=round(planned_str_vol, 2),
    )
    actual = WeeklySummaryTotals(
        cardio_distance_km=round(actual_cardio_dist_m / 1000, 3),
        cardio_duration_min=round(actual_cardio_dur_s / 60, 1),
        strength_exercise_count=actual_str_ex_count,
        strength_volume_kg_reps=round(actual_str_vol, 2),
    )

    return WeeklySummaryOut(planned=planned, actual=actual)


# ── GET /plan/sessions/{planned_session_id}/comparison ───────────────────────

@router.get("/sessions/{planned_session_id}/comparison", response_model=SessionComparisonOut)
async def session_comparison(
    planned_session_id: int,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionComparisonOut:
    result = await db.execute(
        select(PlannedSession)
        .where(PlannedSession.id == planned_session_id)
        .options(selectinload(PlannedSession.cardio_segments))
    )
    ps = result.scalar_one_or_none()
    if ps is None:
        raise HTTPException(status_code=403, detail="Forbidden")

    plan_result = await db.execute(select(WeeklyPlan).where(WeeklyPlan.id == ps.plan_id))
    plan = plan_result.scalar_one_or_none()
    if plan is None or plan.user_id != user:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Locate the matched logged session
    day_start = datetime(ps.planned_date.year, ps.planned_date.month, ps.planned_date.day, tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)

    if ps.session_type == "cardio":
        match_q = (
            select(WorkoutSession)
            .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
            .where(
                WorkoutSession.user_id == user,
                WorkoutSession.type == "cardio",
                WorkoutSession.date >= day_start,
                WorkoutSession.date < day_end,
                CardioSession.activity_type_id == ps.activity_type_id,
            )
        )
    else:
        match_q = (
            select(WorkoutSession)
            .join(StrengthSession, StrengthSession.session_id == WorkoutSession.id)
            .where(
                WorkoutSession.user_id == user,
                WorkoutSession.type == "strength",
                WorkoutSession.date >= day_start,
                WorkoutSession.date < day_end,
                StrengthSession.template_id == ps.template_id,
            )
        )

    matched_ws = (await db.execute(match_q)).scalar_one_or_none()
    if matched_ws is None:
        raise HTTPException(status_code=404, detail="Session is not done")

    matched_session_id = matched_ws.id

    # ── Cardio comparison ────────────────────────────────────────────────────

    if ps.session_type == "cardio":
        has_dist = any(seg.distance_metres is not None for seg in ps.cardio_segments)
        has_dur = any(seg.duration_secs is not None for seg in ps.cardio_segments)
        total_dist_m = sum(seg.distance_metres or 0 for seg in ps.cardio_segments)
        total_dur_s = sum(seg.duration_secs or 0 for seg in ps.cardio_segments)
        planned_distance_km = total_dist_m / 1000 if has_dist else None
        planned_duration_min = total_dur_s / 60 if has_dur else None

        actual_cardio = (
            await db.execute(
                select(CardioSession)
                .where(CardioSession.session_id == matched_session_id)
                .options(selectinload(CardioSession.segments))
            )
        ).scalar_one_or_none()

        actual_distance_km = None
        actual_duration_min = None
        if actual_cardio:
            dist_m = sum(seg.distance_meters or 0 for seg in actual_cardio.segments)
            if any(seg.distance_meters is not None for seg in actual_cardio.segments):
                actual_distance_km = dist_m / 1000
            if actual_cardio.total_duration_seconds is not None:
                actual_duration_min = actual_cardio.total_duration_seconds / 60

        return SessionComparisonOut(
            planned_session_id=ps.id,
            actual_session_id=matched_session_id,
            session_type="cardio",
            cardio=CardioComparisonOut(
                planned_distance_km=planned_distance_km,
                actual_distance_km=actual_distance_km,
                planned_duration_min=planned_duration_min,
                actual_duration_min=actual_duration_min,
            ),
        )

    # ── Strength comparison ──────────────────────────────────────────────────

    if ps.template_id is None or ps.template_version is None:
        raise HTTPException(
            status_code=404,
            detail="No planned exercise data available (template deleted or session predates versioning)",
        )

    history = (
        await db.execute(
            select(StrengthTemplateHistory)
            .where(
                StrengthTemplateHistory.template_id == ps.template_id,
                StrengthTemplateHistory.version == ps.template_version,
            )
            .options(
                selectinload(StrengthTemplateHistory.exercises)
                .selectinload(StrengthTemplateHistoryExercise.sets),
                selectinload(StrengthTemplateHistory.exercises)
                .selectinload(StrengthTemplateHistoryExercise.exercise),
            )
        )
    ).scalar_one_or_none()
    if history is None:
        raise HTTPException(
            status_code=404,
            detail="No planned exercise data available (template deleted or session predates versioning)",
        )

    actual_str = (
        await db.execute(
            select(StrengthSession)
            .where(StrengthSession.session_id == matched_session_id)
            .options(
                selectinload(StrengthSession.exercise_entries)
                .selectinload(StrengthExerciseEntry.sets),
                selectinload(StrengthSession.exercise_entries)
                .selectinload(StrengthExerciseEntry.exercise),
            )
        )
    ).scalar_one_or_none()
    if actual_str is None:
        raise HTTPException(status_code=404, detail="Actual session data not found")

    actual_by_ex_id: dict[int, StrengthExerciseEntry] = {
        e.exercise_id: e for e in actual_str.exercise_entries
    }
    handled_ex_ids: set[int] = set()
    exercises_out: list[ExerciseComparison] = []

    for hist_ex in history.exercises:
        ex_id = hist_ex.exercise_id
        ex_name = hist_ex.exercise.name if hist_ex.exercise else "Unknown exercise"
        actual_entry = actual_by_ex_id.get(ex_id) if ex_id is not None else None
        source = "both" if actual_entry is not None else "planned_only"

        planned_sets = hist_ex.sets
        actual_sets = actual_entry.sets if actual_entry else []
        max_len = max(len(planned_sets), len(actual_sets), 0)

        set_rows: list[SetComparisonRow] = []
        for i in range(max_len):
            p = planned_sets[i] if i < len(planned_sets) else None
            a = actual_sets[i] if i < len(actual_sets) else None
            set_rows.append(SetComparisonRow(
                planned_reps=p.reps if p else None,
                planned_weight_kg=p.weight_kg if p else None,
                actual_reps=a.reps if a else None,
                actual_weight_kg=a.weight if a else None,
            ))

        planned_vol = sum((s.reps or 0) * (s.weight_kg or 0) for s in planned_sets)
        actual_vol = sum((s.reps or 0) * (s.weight or 0) for s in actual_sets)

        exercises_out.append(ExerciseComparison(
            exercise_id=ex_id,
            exercise_name=ex_name,
            source=source,
            planned_volume=planned_vol,
            actual_volume=actual_vol,
            sets=set_rows,
        ))
        if ex_id is not None:
            handled_ex_ids.add(ex_id)

    for actual_entry in actual_str.exercise_entries:
        if actual_entry.exercise_id in handled_ex_ids:
            continue
        ex_name = actual_entry.exercise.name if actual_entry.exercise else "Unknown exercise"
        actual_sets = actual_entry.sets
        set_rows = [
            SetComparisonRow(
                planned_reps=None,
                planned_weight_kg=None,
                actual_reps=s.reps,
                actual_weight_kg=s.weight,
            )
            for s in actual_sets
        ]
        actual_vol = sum((s.reps or 0) * (s.weight or 0) for s in actual_sets)
        exercises_out.append(ExerciseComparison(
            exercise_id=actual_entry.exercise_id,
            exercise_name=ex_name,
            source="actual_only",
            planned_volume=0.0,
            actual_volume=actual_vol,
            sets=set_rows,
        ))

    planned_total = sum(e.planned_volume for e in exercises_out)
    actual_total = sum(e.actual_volume for e in exercises_out)

    return SessionComparisonOut(
        planned_session_id=ps.id,
        actual_session_id=matched_session_id,
        session_type="strength",
        strength=StrengthComparisonOut(
            exercises=exercises_out,
            planned_total_volume=planned_total,
            actual_total_volume=actual_total,
        ),
    )
