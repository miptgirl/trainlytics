from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.cardio_activity_type import CardioActivityType
from app.schemas.cardio_activity_type import (
    CardioActivityTypeCreate,
    CardioActivityTypeOut,
    CardioActivityTypePatch,
)

router = APIRouter(prefix="/cardio-types", tags=["cardio-types"])


@router.get("", response_model=list[CardioActivityTypeOut])
async def list_cardio_types(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CardioActivityType]:
    result = await db.execute(
        select(CardioActivityType)
        .where(CardioActivityType.user_id == user)
        .order_by(CardioActivityType.created_at)
    )
    return list(result.scalars().all())


@router.post("", response_model=CardioActivityTypeOut, status_code=201)
async def create_cardio_type(
    body: CardioActivityTypeCreate,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CardioActivityType:
    activity_type = CardioActivityType(user_id=user, name=body.name)
    db.add(activity_type)
    await db.commit()
    await db.refresh(activity_type)
    return activity_type


@router.patch("/{type_id}", response_model=CardioActivityTypeOut)
async def update_cardio_type(
    type_id: int,
    body: CardioActivityTypePatch,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CardioActivityType:
    activity_type = await db.get(CardioActivityType, type_id)
    if not activity_type or activity_type.user_id != user:
        raise HTTPException(status_code=404, detail="Activity type not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(activity_type, field, value)
    await db.commit()
    await db.refresh(activity_type)
    return activity_type


@router.delete("/{type_id}", status_code=204)
async def delete_cardio_type(
    type_id: int,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    activity_type = await db.get(CardioActivityType, type_id)
    if not activity_type or activity_type.user_id != user:
        raise HTTPException(status_code=404, detail="Activity type not found")
    await db.delete(activity_type)
    await db.commit()
