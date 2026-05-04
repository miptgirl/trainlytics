from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.session import CardioSegment, CardioSession, WorkoutSession
from app.schemas.session import CardioSessionCreate, CardioSessionOut, CardioSessionPatch

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _build_cardio_out(ws: WorkoutSession) -> CardioSessionOut:
    cs = ws.cardio_session
    return CardioSessionOut(
        id=ws.id,
        activity_type_id=cs.activity_type_id,
        total_duration_seconds=cs.total_duration_seconds,
        date=ws.date,
        notes=ws.notes,
        created_at=ws.created_at,
        segments=cs.segments,  # type: ignore[arg-type]
    )


@router.post("/cardio", response_model=CardioSessionOut, status_code=201)
async def create_cardio_session(
    body: CardioSessionCreate,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CardioSessionOut:
    ws = WorkoutSession(user_id=user, type="cardio", date=body.date, notes=body.notes)
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
        .options(selectinload(WorkoutSession.cardio_session).selectinload(CardioSession.segments))
    )
    ws = result.scalar_one()
    return _build_cardio_out(ws)


@router.get("/{session_id}", response_model=CardioSessionOut)
async def get_session(
    session_id: int,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CardioSessionOut:
    result = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user)
        .options(selectinload(WorkoutSession.cardio_session).selectinload(CardioSession.segments))
    )
    ws = result.scalar_one_or_none()
    if ws is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if ws.type != "cardio":
        raise HTTPException(status_code=400, detail="Not a cardio session")
    return _build_cardio_out(ws)


@router.patch("/{session_id}", response_model=CardioSessionOut)
async def update_session(
    session_id: int,
    body: CardioSessionPatch,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CardioSessionOut:
    result = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user)
        .options(selectinload(WorkoutSession.cardio_session).selectinload(CardioSession.segments))
    )
    ws = result.scalar_one_or_none()
    if ws is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if ws.type != "cardio":
        raise HTTPException(status_code=400, detail="Not a cardio session")

    if body.date is not None:
        ws.date = body.date
    if body.notes is not None:
        ws.notes = body.notes

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

    result2 = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.id == ws.id)
        .options(selectinload(WorkoutSession.cardio_session).selectinload(CardioSession.segments))
        .execution_options(populate_existing=True)
    )
    ws = result2.scalar_one()
    return _build_cardio_out(ws)


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
