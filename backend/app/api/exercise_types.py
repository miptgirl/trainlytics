from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.exercise_type import ExerciseType
from app.schemas.exercise_type import (
    ExerciseTypeCreate,
    ExerciseTypeOut,
    ExerciseTypePatch,
)

router = APIRouter(prefix="/exercise-types", tags=["exercise-types"])


@router.get("", response_model=list[ExerciseTypeOut])
async def list_exercise_types(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseType]:
    result = await db.execute(
        select(ExerciseType)
        .where(ExerciseType.user_id == user)
        .order_by(ExerciseType.created_at)
    )
    return list(result.scalars().all())


@router.post("", response_model=ExerciseTypeOut, status_code=201)
async def create_exercise_type(
    body: ExerciseTypeCreate,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ExerciseType:
    exercise_type = ExerciseType(user_id=user, name=body.name)
    db.add(exercise_type)
    await db.commit()
    await db.refresh(exercise_type)
    return exercise_type


@router.patch("/{type_id}", response_model=ExerciseTypeOut)
async def update_exercise_type(
    type_id: int,
    body: ExerciseTypePatch,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ExerciseType:
    exercise_type = await db.get(ExerciseType, type_id)
    if not exercise_type or exercise_type.user_id != user:
        raise HTTPException(status_code=404, detail="Exercise type not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(exercise_type, field, value)
    await db.commit()
    await db.refresh(exercise_type)
    return exercise_type


@router.delete("/{type_id}", status_code=204)
async def delete_exercise_type(
    type_id: int,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    exercise_type = await db.get(ExerciseType, type_id)
    if not exercise_type or exercise_type.user_id != user:
        raise HTTPException(status_code=404, detail="Exercise type not found")
    await db.delete(exercise_type)
    await db.commit()
