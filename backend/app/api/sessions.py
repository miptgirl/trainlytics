from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.exercise import Exercise
from app.models.session import (
    CardioSegment,
    CardioSession,
    StrengthExerciseEntry,
    StrengthSession,
    StrengthSet,
    WorkoutSession,
)
from app.schemas.session import (
    CardioSessionCreate,
    CardioSessionOut,
    CardioSessionPatch,
    SessionListOut,
    SessionSummaryOut,
    StrengthExerciseEntryOut,
    StrengthSessionCreate,
    StrengthSessionOut,
    StrengthSessionPatch,
    StrengthSetOut,
    TrainingTrendPoint,
    WeeklyActivitySummary,
    WeeklySummaryOut,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _build_cardio_out(ws: WorkoutSession) -> CardioSessionOut:
    cs = ws.cardio_session
    return CardioSessionOut(
        id=ws.id,
        activity_type_id=cs.activity_type_id,
        total_duration_seconds=cs.total_duration_seconds,
        date=ws.date,
        notes=ws.notes,
        title=ws.title,
        calories=ws.calories,
        created_at=ws.created_at,
        segments=cs.segments,  # type: ignore[arg-type]
    )


def _build_strength_out(ws: WorkoutSession) -> StrengthSessionOut:
    ss = ws.strength_session
    exercises_out = []
    for entry in ss.exercise_entries:
        exercises_out.append(
            StrengthExerciseEntryOut(
                id=entry.id,
                exercise_id=entry.exercise_id,
                exercise_name=entry.exercise.name,
                order=entry.order,
                sets=[
                    StrengthSetOut(
                        id=s.id,
                        set_number=s.set_number,
                        reps=s.reps,
                        weight=s.weight,
                        notes=s.notes,
                    )
                    for s in entry.sets
                ],
            )
        )
    return StrengthSessionOut(
        id=ws.id,
        type=ws.type,
        date=ws.date,
        notes=ws.notes,
        title=ws.title,
        calories=ws.calories,
        duration_seconds=ws.strength_session.duration_seconds,
        created_at=ws.created_at,
        exercises=exercises_out,
    )


_CARDIO_LOAD = selectinload(WorkoutSession.cardio_session).selectinload(CardioSession.segments)


async def _load_strength_ws(db: AsyncSession, session_id: int, user: str) -> WorkoutSession:
    result = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user)
        .options(
            selectinload(WorkoutSession.strength_session)
            .selectinload(StrengthSession.exercise_entries)
            .selectinload(StrengthExerciseEntry.sets),
            selectinload(WorkoutSession.strength_session)
            .selectinload(StrengthSession.exercise_entries)
            .selectinload(StrengthExerciseEntry.exercise),
        )
        .execution_options(populate_existing=True)
    )
    ws = result.scalar_one_or_none()
    if ws is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if ws.type != "strength":
        raise HTTPException(status_code=400, detail="Not a strength session")
    return ws


# ── history list ──────────────────────────────────────────────────────────────

@router.get("", response_model=SessionListOut)
async def list_sessions(
    type: str | None = Query(None, description="cardio or strength"),
    date_from: str | None = Query(None, description="ISO date or datetime, inclusive"),
    date_to: str | None = Query(None, description="ISO date or datetime, inclusive"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionListOut:
    from datetime import datetime as dt

    q = select(WorkoutSession).where(WorkoutSession.user_id == user)

    if type is not None:
        q = q.where(WorkoutSession.type == type)
    if date_from is not None:
        q = q.where(WorkoutSession.date >= dt.fromisoformat(date_from))
    if date_to is not None:
        q = q.where(WorkoutSession.date <= dt.fromisoformat(date_to))

    count_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_result.scalar_one()

    q = (
        q.order_by(WorkoutSession.date.desc(), WorkoutSession.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .options(
            _CARDIO_LOAD,
            selectinload(WorkoutSession.strength_session)
            .selectinload(StrengthSession.exercise_entries)
            .selectinload(StrengthExerciseEntry.sets),
        )
    )

    rows = (await db.execute(q)).scalars().all()

    items: list[SessionSummaryOut] = []
    for ws in rows:
        if ws.type == "cardio" and ws.cardio_session:
            cs = ws.cardio_session
            total_distance = sum(
                seg.distance_meters for seg in cs.segments if seg.distance_meters is not None
            ) or None
            items.append(
                SessionSummaryOut(
                    id=ws.id,
                    type=ws.type,
                    date=ws.date,
                    notes=ws.notes,
                    title=ws.title,
                    calories=ws.calories,
                    created_at=ws.created_at,
                    total_duration_seconds=cs.total_duration_seconds,
                    total_distance_meters=total_distance,
                )
            )
        elif ws.type == "strength" and ws.strength_session:
            ss = ws.strength_session
            total_sets = sum(len(e.sets) for e in ss.exercise_entries)
            exercise_count = len(ss.exercise_entries)
            total_volume = sum(
                (s.weight or 0) * (s.reps or 0)
                for e in ss.exercise_entries
                for s in e.sets
            ) or None
            items.append(
                SessionSummaryOut(
                    id=ws.id,
                    type=ws.type,
                    date=ws.date,
                    notes=ws.notes,
                    title=ws.title,
                    calories=ws.calories,
                    created_at=ws.created_at,
                    total_sets=total_sets,
                    exercise_count=exercise_count,
                    total_volume=total_volume,
                    duration_seconds=ss.duration_seconds,
                )
            )
        else:
            items.append(
                SessionSummaryOut(
                    id=ws.id,
                    type=ws.type,
                    date=ws.date,
                    notes=ws.notes,
                    title=ws.title,
                    calories=ws.calories,
                    created_at=ws.created_at,
                )
            )

    return SessionListOut(items=items, total=total, page=page, page_size=page_size)


# ── cardio ────────────────────────────────────────────────────────────────────

@router.post("/cardio", response_model=CardioSessionOut, status_code=201)
async def create_cardio_session(
    body: CardioSessionCreate,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CardioSessionOut:
    ws = WorkoutSession(
        user_id=user,
        type="cardio",
        date=body.date,
        notes=body.notes,
        title=body.title,
        calories=body.calories,
    )
    db.add(ws)
    await db.flush()

    cs = CardioSession(
        session_id=ws.id,
        activity_type_id=body.activity_type_id,
        total_duration_seconds=body.total_duration_seconds,
    )
    db.add(cs)
    await db.flush()

    for seg in body.segments:
        db.add(CardioSegment(cardio_session_id=cs.id, **seg.model_dump()))

    await db.commit()

    result = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.id == ws.id)
        .options(_CARDIO_LOAD)
    )
    ws = result.scalar_one()
    return _build_cardio_out(ws)


# ── strength ──────────────────────────────────────────────────────────────────

@router.post("/strength", response_model=StrengthSessionOut, status_code=201)
async def create_strength_session(
    body: StrengthSessionCreate,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StrengthSessionOut:
    exercise_ids = [e.exercise_id for e in body.exercises]
    result = await db.execute(
        select(Exercise).where(Exercise.id.in_(exercise_ids), Exercise.user_id == user)
    )
    found = {ex.id for ex in result.scalars().all()}
    missing = set(exercise_ids) - found
    if missing:
        raise HTTPException(status_code=400, detail=f"Exercise(s) not found: {missing}")

    ws = WorkoutSession(
        user_id=user,
        type="strength",
        date=body.date,
        notes=body.notes,
        title=body.title,
        calories=body.calories,
    )
    db.add(ws)
    await db.flush()

    ss = StrengthSession(session_id=ws.id, duration_seconds=body.duration_seconds)
    db.add(ss)
    await db.flush()

    for entry in body.exercises:
        ee = StrengthExerciseEntry(
            strength_session_id=ss.id,
            exercise_id=entry.exercise_id,
            order=entry.order,
        )
        db.add(ee)
        await db.flush()
        for s in entry.sets:
            db.add(StrengthSet(exercise_entry_id=ee.id, **s.model_dump()))

    await db.commit()
    return _build_strength_out(await _load_strength_ws(db, ws.id, user))


# ── shared GET / PATCH / DELETE ───────────────────────────────────────────────

@router.get("/weekly-summary", response_model=WeeklySummaryOut)
async def weekly_summary(
    week_start: str = Query(..., description="ISO date of the week start (any day in the Mon–Sun week)"),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WeeklySummaryOut:
    from datetime import date as DateType, timedelta

    pivot = DateType.fromisoformat(week_start)
    monday = pivot - timedelta(days=pivot.weekday())
    sunday_end = monday + timedelta(days=7)  # exclusive upper bound (next Monday 00:00)

    from datetime import datetime as dt, timezone
    mon_dt = dt(monday.year, monday.month, monday.day, tzinfo=timezone.utc)
    sun_dt = dt(sunday_end.year, sunday_end.month, sunday_end.day, tzinfo=timezone.utc)

    # Cardio
    cardio_q = (
        select(
            func.coalesce(func.sum(CardioSession.total_duration_seconds), 0).label("dur"),
            func.coalesce(func.sum(WorkoutSession.calories), 0).label("cal"),
        )
        .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.user_id == user,
            WorkoutSession.type == "cardio",
            WorkoutSession.date >= mon_dt,
            WorkoutSession.date < sun_dt,
        )
    )
    cardio_row = (await db.execute(cardio_q)).one()
    cardio_minutes = int((cardio_row.dur or 0) // 60)
    cardio_calories = int(cardio_row.cal or 0)

    # Strength
    strength_q = (
        select(
            func.coalesce(func.sum(StrengthSession.duration_seconds), 0).label("dur"),
            func.coalesce(func.sum(WorkoutSession.calories), 0).label("cal"),
        )
        .join(StrengthSession, StrengthSession.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.user_id == user,
            WorkoutSession.type == "strength",
            WorkoutSession.date >= mon_dt,
            WorkoutSession.date < sun_dt,
        )
    )
    strength_row = (await db.execute(strength_q)).one()
    strength_minutes = int((strength_row.dur or 0) // 60)
    strength_calories = int(strength_row.cal or 0)

    return WeeklySummaryOut(
        cardio=WeeklyActivitySummary(minutes=cardio_minutes, calories=cardio_calories),
        strength=WeeklyActivitySummary(minutes=strength_minutes, calories=strength_calories),
    )


@router.get("/training-trends", response_model=list[TrainingTrendPoint])
async def training_trends(
    weeks: int = Query(12, ge=1, le=52),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TrainingTrendPoint]:
    from datetime import date as DateType, timedelta, datetime as dt, timezone

    today = DateType.today()
    # Start of current week (Monday)
    current_monday = today - timedelta(days=today.weekday())
    next_monday = current_monday + timedelta(weeks=1)
    # Last N full weeks + the current (in-progress) week
    week_starts = [current_monday - timedelta(weeks=i) for i in range(weeks, 0, -1)] + [current_monday]

    # Fetch all sessions in range (inclusive of the current week)
    range_start = dt(week_starts[0].year, week_starts[0].month, week_starts[0].day, tzinfo=timezone.utc)
    range_end = dt(next_monday.year, next_monday.month, next_monday.day, tzinfo=timezone.utc)

    cardio_rows = (
        await db.execute(
            select(WorkoutSession.date, CardioSession.total_duration_seconds, WorkoutSession.calories)
            .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
            .where(
                WorkoutSession.user_id == user,
                WorkoutSession.type == "cardio",
                WorkoutSession.date >= range_start,
                WorkoutSession.date < range_end,
            )
        )
    ).all()

    strength_rows = (
        await db.execute(
            select(WorkoutSession.date, StrengthSession.duration_seconds, WorkoutSession.calories)
            .join(StrengthSession, StrengthSession.session_id == WorkoutSession.id)
            .where(
                WorkoutSession.user_id == user,
                WorkoutSession.type == "strength",
                WorkoutSession.date >= range_start,
                WorkoutSession.date < range_end,
            )
        )
    ).all()

    # Bucket by week
    def week_of(d: dt) -> DateType:
        d_date = d.date() if hasattr(d, "date") else d
        return d_date - timedelta(days=d_date.weekday())

    cardio_by_week: dict[DateType, tuple[int, int]] = {}
    for row_date, dur, cal in cardio_rows:
        w = week_of(row_date)
        prev_dur, prev_cal = cardio_by_week.get(w, (0, 0))
        cardio_by_week[w] = (prev_dur + (dur or 0), prev_cal + (cal or 0))

    strength_by_week: dict[DateType, tuple[int, int]] = {}
    for row_date, dur, cal in strength_rows:
        w = week_of(row_date)
        prev_dur, prev_cal = strength_by_week.get(w, (0, 0))
        strength_by_week[w] = (prev_dur + (dur or 0), prev_cal + (cal or 0))

    result = []
    for ws in week_starts:
        c_dur, c_cal = cardio_by_week.get(ws, (0, 0))
        s_dur, s_cal = strength_by_week.get(ws, (0, 0))
        result.append(
            TrainingTrendPoint(
                week_start=ws,
                cardio_minutes=c_dur // 60,
                strength_minutes=s_dur // 60,
                cardio_calories=c_cal,
                strength_calories=s_cal,
            )
        )
    return result


@router.get("/{session_id}", response_model=Any)
async def get_session(
    session_id: int,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    result = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user)
        .options(
            _CARDIO_LOAD,
            selectinload(WorkoutSession.strength_session)
            .selectinload(StrengthSession.exercise_entries)
            .selectinload(StrengthExerciseEntry.sets),
            selectinload(WorkoutSession.strength_session)
            .selectinload(StrengthSession.exercise_entries)
            .selectinload(StrengthExerciseEntry.exercise),
        )
    )
    ws = result.scalar_one_or_none()
    if ws is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if ws.type == "cardio":
        return _build_cardio_out(ws)
    if ws.type == "strength":
        return _build_strength_out(ws)
    raise HTTPException(status_code=400, detail="Unknown session type")


@router.patch("/{session_id}", response_model=Any)
async def update_session(
    session_id: int,
    body: dict,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    ws_check = await db.get(WorkoutSession, session_id)
    if ws_check is None or ws_check.user_id != user:
        raise HTTPException(status_code=404, detail="Session not found")

    if ws_check.type == "cardio":
        return await _patch_cardio(session_id, CardioSessionPatch.model_validate(body), user, db)
    if ws_check.type == "strength":
        return await _patch_strength(session_id, StrengthSessionPatch.model_validate(body), user, db)
    raise HTTPException(status_code=400, detail="Unknown session type")


async def _patch_cardio(
    session_id: int, body: CardioSessionPatch, user: str, db: AsyncSession
) -> CardioSessionOut:
    result = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user)
        .options(_CARDIO_LOAD)
    )
    ws = result.scalar_one_or_none()
    if ws is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if body.date is not None:
        ws.date = body.date
    if body.notes is not None:
        ws.notes = body.notes
    if body.title is not None:
        ws.title = body.title
    if body.calories is not None:
        ws.calories = body.calories

    cs = ws.cardio_session
    if body.activity_type_id is not None:
        cs.activity_type_id = body.activity_type_id
    if body.total_duration_seconds is not None:
        cs.total_duration_seconds = body.total_duration_seconds

    if body.segments is not None:
        await db.execute(
            delete(CardioSegment).where(CardioSegment.cardio_session_id == cs.id)
        )
        await db.flush()
        for seg in body.segments:
            db.add(CardioSegment(cardio_session_id=cs.id, **seg.model_dump()))

    await db.commit()
    db.expunge_all()

    result2 = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.id == session_id)
        .options(_CARDIO_LOAD)
    )
    ws = result2.scalar_one()
    return _build_cardio_out(ws)


async def _patch_strength(
    session_id: int, body: StrengthSessionPatch, user: str, db: AsyncSession
) -> StrengthSessionOut:
    ws = await _load_strength_ws(db, session_id, user)

    if body.date is not None:
        ws.date = body.date
    if body.notes is not None:
        ws.notes = body.notes
    if body.title is not None:
        ws.title = body.title
    if body.calories is not None:
        ws.calories = body.calories
    if body.duration_seconds is not None:
        ws.strength_session.duration_seconds = body.duration_seconds

    if body.exercises is not None:
        exercise_ids = [e.exercise_id for e in body.exercises]
        result = await db.execute(
            select(Exercise).where(Exercise.id.in_(exercise_ids), Exercise.user_id == user)
        )
        found = {ex.id for ex in result.scalars().all()}
        missing = set(exercise_ids) - found
        if missing:
            raise HTTPException(status_code=400, detail=f"Exercise(s) not found: {missing}")

        ss = ws.strength_session
        entry_ids = [e.id for e in ss.exercise_entries]
        if entry_ids:
            await db.execute(
                delete(StrengthSet).where(StrengthSet.exercise_entry_id.in_(entry_ids))
            )
        await db.execute(
            delete(StrengthExerciseEntry).where(
                StrengthExerciseEntry.strength_session_id == ss.id
            )
        )
        await db.flush()
        for entry in body.exercises:
            ee = StrengthExerciseEntry(
                strength_session_id=ss.id,
                exercise_id=entry.exercise_id,
                order=entry.order,
            )
            db.add(ee)
            await db.flush()
            for s in entry.sets:
                db.add(StrengthSet(exercise_entry_id=ee.id, **s.model_dump()))

    await db.commit()
    db.expunge_all()
    return _build_strength_out(await _load_strength_ws(db, session_id, user))


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: int,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    ws = await db.get(WorkoutSession, session_id)
    if ws is None or ws.user_id != user:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(ws)
    await db.commit()

