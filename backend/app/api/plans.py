from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.plan import PlannedCardioSegment, PlannedSession, WeeklyPlan
from app.models.session import CardioSegment, CardioSession, StrengthSession, WorkoutSession
from app.models.template import StrengthTemplate
from app.schemas.plan import (
    PlannedSessionIn,
    PlannedSessionOut,
    SkipNoteIn,
    WeekPlanOut,
)

router = APIRouter(prefix="/plans", tags=["plans"])

_SESSION_LOAD = selectinload(PlannedSession.cardio_segments)


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


_PLAN_LOAD = selectinload(WeeklyPlan.sessions).selectinload(PlannedSession.cardio_segments)


async def _load_plan(db: AsyncSession, user: str, week_start: date) -> WeeklyPlan | None:
    result = await db.execute(
        select(WeeklyPlan)
        .where(WeeklyPlan.user_id == user, WeeklyPlan.week_start == week_start)
        .options(_PLAN_LOAD)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def _get_or_create_plan(db: AsyncSession, user: str, week_start: date) -> WeeklyPlan:
    plan = await _load_plan(db, user, week_start)
    if plan is None:
        plan = WeeklyPlan(user_id=user, week_start=week_start)
        db.add(plan)
        await db.commit()
        plan = await _load_plan(db, user, week_start)
    return plan  # type: ignore[return-value]


async def _compute_status(
    db: AsyncSession,
    user: str,
    session: PlannedSession,
) -> tuple[Literal["planned", "done", "skipped"], int | None]:
    from datetime import date as DateType, datetime, timezone

    today = DateType.today()
    planned_date = session.planned_date

    # Query workout sessions on the planned date for this user
    day_start = datetime(planned_date.year, planned_date.month, planned_date.day, tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)

    if session.session_type == "strength":
        result = await db.execute(
            select(WorkoutSession)
            .join(StrengthSession, StrengthSession.session_id == WorkoutSession.id)
            .where(
                WorkoutSession.user_id == user,
                WorkoutSession.type == "strength",
                WorkoutSession.date >= day_start,
                WorkoutSession.date < day_end,
                StrengthSession.template_id == session.template_id,
            )
        )
        match = result.scalar_one_or_none()
        if match:
            return "done", match.id
    else:
        # Cardio: match if any logged cardio session has a segment matching the primary activity type
        if not session.cardio_segments:
            pass
        else:
            primary_activity_type_id = session.cardio_segments[0].activity_type_id
            result = await db.execute(
                select(WorkoutSession)
                .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
                .join(CardioSegment, CardioSegment.cardio_session_id == CardioSession.id)
                .where(
                    WorkoutSession.user_id == user,
                    WorkoutSession.type == "cardio",
                    WorkoutSession.date >= day_start,
                    WorkoutSession.date < day_end,
                    CardioSegment.activity_type_id == primary_activity_type_id,
                )
            )
            match = result.scalar_one_or_none()
            if match:
                return "done", match.id

    if planned_date >= today:
        return "planned", None
    return "skipped", None


async def _build_session_out(
    db: AsyncSession, user: str, session: PlannedSession
) -> PlannedSessionOut:
    status, matched_id = await _compute_status(db, user, session)
    return PlannedSessionOut(
        id=session.id,
        planned_date=session.planned_date,
        session_type=session.session_type,
        template_id=session.template_id,
        title=session.title,
        notes=session.notes,
        skip_note=session.skip_note,
        display_order=session.display_order,
        segments=session.cardio_segments,
        status=status,
        matched_session_id=matched_id,
    )


async def _build_week_plan_out(
    db: AsyncSession, user: str, plan: WeeklyPlan
) -> WeekPlanOut:
    sessions_out = []
    for session in plan.sessions:
        sessions_out.append(await _build_session_out(db, user, session))
    return WeekPlanOut(plan_id=plan.id, week_start=plan.week_start, sessions=sessions_out)


async def _load_session(
    db: AsyncSession, user: str, plan_id: int, session_id: int
) -> PlannedSession:
    result = await db.execute(
        select(PlannedSession)
        .where(PlannedSession.id == session_id, PlannedSession.plan_id == plan_id)
        .options(_SESSION_LOAD)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Planned session not found")
    return session


def _require_monday(week_start_str: str) -> date:
    try:
        d = date.fromisoformat(week_start_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format; expected YYYY-MM-DD")
    if d.weekday() != 0:
        raise HTTPException(status_code=400, detail="week_start must be a Monday")
    return d


# ── GET /plans/{week_start} ───────────────────────────────────────────────────

@router.get("/{week_start}", response_model=WeekPlanOut)
async def get_week_plan(
    week_start: str,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WeekPlanOut:
    d = _require_monday(week_start)
    plan = await _get_or_create_plan(db, user, d)
    return await _build_week_plan_out(db, user, plan)


# ── POST /plans/{week_start}/sessions ────────────────────────────────────────

@router.post("/{week_start}/sessions", response_model=PlannedSessionOut, status_code=201)
async def add_planned_session(
    week_start: str,
    body: PlannedSessionIn,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlannedSessionOut:
    d = _require_monday(week_start)
    plan = await _get_or_create_plan(db, user, d)

    title = body.title
    if body.session_type == "strength" and title is None:
        template = await db.get(StrengthTemplate, body.template_id)
        if template is None or template.user_id != user:
            raise HTTPException(status_code=400, detail="Template not found")
        title = template.name

    session = PlannedSession(
        plan_id=plan.id,
        planned_date=body.planned_date,
        session_type=body.session_type,
        template_id=body.template_id,
        title=title,
        notes=body.notes,
        display_order=body.display_order,
    )
    db.add(session)
    await db.flush()

    for seg in body.segments:
        db.add(PlannedCardioSegment(planned_session_id=session.id, **seg.model_dump()))

    await db.commit()

    result = await db.execute(
        select(PlannedSession).where(PlannedSession.id == session.id).options(_SESSION_LOAD)
    )
    session = result.scalar_one()
    return await _build_session_out(db, user, session)


# ── PUT /plans/{week_start}/sessions/{session_id} ────────────────────────────

@router.put("/{week_start}/sessions/{session_id}", response_model=PlannedSessionOut)
async def update_planned_session(
    week_start: str,
    session_id: int,
    body: PlannedSessionIn,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlannedSessionOut:
    d = _require_monday(week_start)
    plan = await _get_or_create_plan(db, user, d)
    session = await _load_session(db, user, plan.id, session_id)

    title = body.title
    if body.session_type == "strength" and title is None:
        template = await db.get(StrengthTemplate, body.template_id)
        if template is None or template.user_id != user:
            raise HTTPException(status_code=400, detail="Template not found")
        title = template.name

    session.planned_date = body.planned_date
    session.session_type = body.session_type
    session.template_id = body.template_id
    session.title = title
    session.notes = body.notes
    session.display_order = body.display_order

    if body.session_type == "cardio":
        await db.execute(
            delete(PlannedCardioSegment).where(
                PlannedCardioSegment.planned_session_id == session.id
            )
        )
        await db.flush()
        for seg in body.segments:
            db.add(PlannedCardioSegment(planned_session_id=session.id, **seg.model_dump()))

    await db.commit()

    result = await db.execute(
        select(PlannedSession)
        .where(PlannedSession.id == session.id)
        .options(_SESSION_LOAD)
        .execution_options(populate_existing=True)
    )
    session = result.scalar_one()
    return await _build_session_out(db, user, session)


# ── DELETE /plans/{week_start}/sessions/{session_id} ─────────────────────────

@router.delete("/{week_start}/sessions/{session_id}", status_code=204)
async def delete_planned_session(
    week_start: str,
    session_id: int,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    d = _require_monday(week_start)
    plan = await _get_or_create_plan(db, user, d)
    session = await _load_session(db, user, plan.id, session_id)
    await db.delete(session)
    await db.commit()


# ── PATCH /plans/{week_start}/sessions/{session_id}/skip-note ────────────────

@router.patch("/{week_start}/sessions/{session_id}/skip-note", response_model=PlannedSessionOut)
async def update_skip_note(
    week_start: str,
    session_id: int,
    body: SkipNoteIn,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlannedSessionOut:
    d = _require_monday(week_start)
    plan = await _get_or_create_plan(db, user, d)
    session = await _load_session(db, user, plan.id, session_id)
    session.skip_note = body.skip_note
    await db.commit()

    result = await db.execute(
        select(PlannedSession).where(PlannedSession.id == session.id).options(_SESSION_LOAD)
    )
    session = result.scalar_one()
    return await _build_session_out(db, user, session)


# ── POST /plans/{week_start}/copy-from-last-week ──────────────────────────────

@router.post("/{week_start}/copy-from-last-week", response_model=WeekPlanOut)
async def copy_from_last_week(
    week_start: str,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WeekPlanOut:
    d = _require_monday(week_start)
    prev_week_start = d - timedelta(days=7)

    current_plan = await _get_or_create_plan(db, user, d)

    if current_plan.sessions:
        raise HTTPException(status_code=409, detail="Week already has a plan")

    prev_plan = await _load_plan(db, user, prev_week_start)

    if prev_plan and prev_plan.sessions:
        for prev_session in prev_plan.sessions:
            new_date = prev_session.planned_date + timedelta(days=7)
            new_session = PlannedSession(
                plan_id=current_plan.id,
                planned_date=new_date,
                session_type=prev_session.session_type,
                template_id=prev_session.template_id,
                title=prev_session.title,
                notes=prev_session.notes,
                skip_note=None,
                display_order=prev_session.display_order,
            )
            db.add(new_session)
            await db.flush()
            for seg in prev_session.cardio_segments:
                db.add(PlannedCardioSegment(
                    planned_session_id=new_session.id,
                    segment_order=seg.segment_order,
                    title=seg.title,
                    activity_type_id=seg.activity_type_id,
                    duration_secs=seg.duration_secs,
                    distance_metres=seg.distance_metres,
                    pace_secs_per_km=seg.pace_secs_per_km,
                    notes=seg.notes,
                ))
        await db.commit()

    current_plan = await _load_plan(db, user, d)
    return await _build_week_plan_out(db, user, current_plan)  # type: ignore[arg-type]
