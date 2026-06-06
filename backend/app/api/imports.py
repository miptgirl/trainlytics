from datetime import date as DateType, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.cardio_activity_type import CardioActivityType
from app.models.pending_import import ImportStatus, PendingImport
from app.models.session import (
    CardioSegment,
    CardioSession,
    StrengthSession,
    WorkoutSession,
)
from app.schemas.imports import (
    AcceptAllOut,
    DiscardAllOut,
    ImportAcceptOut,
    ImportConflict,
    ImportPatch,
    PendingImportListOut,
    PendingImportOut,
)

router = APIRouter(prefix="/imports", tags=["imports"])


def _session_date_range(date_str: str) -> tuple[datetime, datetime]:
    """Return a ±1-day UTC datetime range for a date string like '2024-01-01'."""
    d = DateType.fromisoformat(date_str)
    start = datetime(d.year, d.month, d.day, tzinfo=timezone.utc) - timedelta(days=1)
    end = datetime(d.year, d.month, d.day, tzinfo=timezone.utc) + timedelta(days=2)
    return start, end


async def _find_duplicate(
    db: AsyncSession,
    user: str,
    date_str: str,
    duration_seconds: int | None,
) -> WorkoutSession | None:
    """Return a session that looks like a duplicate, or None."""
    if not date_str or duration_seconds is None:
        return None

    start, end = _session_date_range(date_str)

    # Check cardio sessions within date range and duration ±60 s
    cardio_q = (
        select(WorkoutSession)
        .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.user_id == user,
            WorkoutSession.date >= start,
            WorkoutSession.date < end,
            CardioSession.total_duration_seconds.isnot(None),
            func.abs(CardioSession.total_duration_seconds - duration_seconds) <= 60,
        )
        .limit(1)
    )
    result = await db.execute(cardio_q)
    ws = result.scalar_one_or_none()
    if ws:
        return ws

    # Check strength sessions within date range and duration ±60 s
    strength_q = (
        select(WorkoutSession)
        .join(StrengthSession, StrengthSession.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.user_id == user,
            WorkoutSession.date >= start,
            WorkoutSession.date < end,
            StrengthSession.duration_seconds.isnot(None),
            func.abs(StrengthSession.duration_seconds - duration_seconds) <= 60,
        )
        .limit(1)
    )
    result = await db.execute(strength_q)
    return result.scalar_one_or_none()


async def _create_session_from_import(
    db: AsyncSession,
    user: str,
    mapped: dict,
) -> WorkoutSession:
    """Create a WorkoutSession (and CardioSession/StrengthSession) from mapped_session JSON."""
    session_type = mapped.get("type", "cardio")
    date_str = mapped.get("date")
    if date_str:
        d = DateType.fromisoformat(date_str)
        session_date = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    else:
        session_date = datetime.now(timezone.utc)

    calories_raw = mapped.get("calories")
    calories = int(calories_raw) if calories_raw is not None else None
    avg_hr_raw = mapped.get("avg_hr_bpm")
    avg_hr = int(avg_hr_raw) if avg_hr_raw is not None else None

    ws = WorkoutSession(
        user_id=user,
        type=session_type,
        date=session_date,
        title=mapped.get("title"),
        notes=mapped.get("notes"),
        calories=calories,
        avg_hr_bpm=avg_hr,
    )
    db.add(ws)
    await db.flush()

    if session_type == "cardio":
        activity_type_id: int | None = None
        activity_type_name = mapped.get("activity_type")
        if activity_type_name:
            result = await db.execute(
                select(CardioActivityType).where(
                    CardioActivityType.user_id == user,
                    func.lower(CardioActivityType.name) == activity_type_name.lower(),
                )
            )
            cat = result.scalar_one_or_none()
            activity_type_id = cat.id if cat else None

        cs = CardioSession(
            session_id=ws.id,
            activity_type_id=activity_type_id,
            total_duration_seconds=mapped.get("duration_seconds"),
        )
        db.add(cs)
        await db.flush()

        for i, seg in enumerate(mapped.get("segments") or []):
            seg_type_id: int | None = None
            seg_type_name = seg.get("activity_type")
            if seg_type_name:
                result = await db.execute(
                    select(CardioActivityType).where(
                        CardioActivityType.user_id == user,
                        func.lower(CardioActivityType.name) == seg_type_name.lower(),
                    )
                )
                seg_cat = result.scalar_one_or_none()
                seg_type_id = seg_cat.id if seg_cat else None

            db.add(
                CardioSegment(
                    cardio_session_id=cs.id,
                    order=i,
                    duration_seconds=seg.get("duration_seconds") or 0,
                    distance_meters=seg.get("distance_m"),
                    pace_seconds_per_km=seg.get("pace_s_per_km"),
                    activity_type_id=seg_type_id,
                )
            )
    else:
        ss = StrengthSession(
            session_id=ws.id,
            duration_seconds=mapped.get("duration_seconds"),
        )
        db.add(ss)

    await db.flush()
    return ws


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/pending", response_model=PendingImportListOut)
async def list_pending(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PendingImportListOut:
    result = await db.execute(
        select(PendingImport)
        .where(PendingImport.status == ImportStatus.pending.value)
        .order_by(PendingImport.created_at.desc())
    )
    rows = result.scalars().all()

    items = [
        PendingImportOut(
            id=r.id,
            source=r.source,
            status=r.status,
            mapped_session=r.mapped_session,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in rows
    ]
    return PendingImportListOut(items=items, total_pending=len(items))


@router.post("/accept-all", response_model=AcceptAllOut)
async def accept_all(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AcceptAllOut:
    result = await db.execute(
        select(PendingImport)
        .where(PendingImport.status == ImportStatus.pending.value)
        .order_by(PendingImport.created_at.asc())
    )
    rows = result.scalars().all()

    accepted_count = 0
    conflicts = []

    for row in rows:
        mapped = row.mapped_session or {}
        date_str = mapped.get("date")
        duration = mapped.get("duration_seconds")

        dup = await _find_duplicate(db, user, date_str, duration)
        if dup:
            conflicts.append({"import_id": row.id, "session_id": dup.id})
            continue

        ws = await _create_session_from_import(db, user, mapped)
        row.status = ImportStatus.accepted.value
        await db.commit()
        accepted_count += 1

    return AcceptAllOut(accepted=accepted_count, conflicts=conflicts)


@router.post("/discard-all", response_model=DiscardAllOut)
async def discard_all(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DiscardAllOut:
    result = await db.execute(
        select(PendingImport).where(PendingImport.status == ImportStatus.pending.value)
    )
    rows = result.scalars().all()
    for row in rows:
        row.status = ImportStatus.discarded.value
    await db.commit()
    return DiscardAllOut(discarded=len(rows))


@router.post("/{import_id}/accept", response_model=ImportAcceptOut)
async def accept_import(
    import_id: int,
    force: bool = Query(False),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ImportAcceptOut:
    row = await db.get(PendingImport, import_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Import not found")
    if row.status != ImportStatus.pending.value:
        raise HTTPException(status_code=400, detail=f"Import is already {row.status}")

    mapped = row.mapped_session or {}
    date_str = mapped.get("date")
    duration = mapped.get("duration_seconds")

    if not force:
        dup = await _find_duplicate(db, user, date_str, duration)
        if dup:
            dup_date = dup.date.date().isoformat() if dup.date else None
            cs = await db.execute(
                select(CardioSession).where(CardioSession.session_id == dup.id)
            )
            cardio = cs.scalar_one_or_none()
            ss = await db.execute(
                select(StrengthSession).where(StrengthSession.session_id == dup.id)
            )
            strength = ss.scalar_one_or_none()
            dup_duration = (
                cardio.total_duration_seconds if cardio
                else strength.duration_seconds if strength
                else None
            )
            raise HTTPException(
                status_code=409,
                detail={
                    "conflict": ImportConflict(
                        session_id=dup.id,
                        date=dup_date,
                        duration=dup_duration,
                    ).model_dump()
                },
            )

    ws = await _create_session_from_import(db, user, mapped)
    row.status = ImportStatus.accepted.value
    await db.commit()

    return ImportAcceptOut(session_id=ws.id)


@router.post("/{import_id}/discard", status_code=200)
async def discard_import(
    import_id: int,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = await db.get(PendingImport, import_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Import not found")
    if row.status != ImportStatus.pending.value:
        raise HTTPException(status_code=400, detail=f"Import is already {row.status}")

    row.status = ImportStatus.discarded.value
    await db.commit()
    return {"discarded": True}


@router.patch("/{import_id}", response_model=PendingImportOut)
async def patch_import(
    import_id: int,
    body: ImportPatch,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PendingImportOut:
    row = await db.get(PendingImport, import_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Import not found")
    if row.status != ImportStatus.pending.value:
        raise HTTPException(status_code=400, detail=f"Import is already {row.status}")

    mapped = dict(row.mapped_session or {})

    if body.date is not None:
        mapped["date"] = body.date
    if body.activity_type is not None:
        mapped["activity_type"] = body.activity_type
    if body.title is not None:
        mapped["title"] = body.title
    if body.notes is not None:
        mapped["notes"] = body.notes

    row.mapped_session = mapped
    await db.commit()
    await db.refresh(row)

    return PendingImportOut(
        id=row.id,
        source=row.source,
        status=row.status,
        mapped_session=row.mapped_session,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )
