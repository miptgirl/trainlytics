from datetime import date as DateType

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.step import DailySteps
from app.schemas.step import StepEntryCreate, StepEntryResponse

router = APIRouter(prefix="/steps", tags=["steps"])


@router.post("", response_model=StepEntryResponse, status_code=201)
async def upsert_steps(
    body: StepEntryCreate,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DailySteps:
    result = await db.execute(
        select(DailySteps).where(
            DailySteps.user_id == user,
            DailySteps.date == body.date,
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        entry = DailySteps(user_id=user, date=body.date, steps=body.steps)
        db.add(entry)
    else:
        entry.steps = body.steps
    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("", response_model=list[StepEntryResponse])
async def list_steps(
    start_date: DateType = Query(...),
    end_date: DateType = Query(...),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DailySteps]:
    result = await db.execute(
        select(DailySteps)
        .where(
            DailySteps.user_id == user,
            DailySteps.date >= start_date,
            DailySteps.date <= end_date,
        )
        .order_by(DailySteps.date.desc())
    )
    return list(result.scalars().all())
