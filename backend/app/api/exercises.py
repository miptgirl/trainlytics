from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.exercise import Exercise
from app.models.exercise_type import ExerciseType
from app.schemas.exercise import ExerciseCreate, ExerciseOut, ExercisePatch

router = APIRouter(prefix="/exercises", tags=["exercises"])


async def _resolve_types(
    type_ids: list[int], user: str, db: AsyncSession
) -> list[ExerciseType]:
    """Return ExerciseType rows for the given ids, scoped to the user. Raises 400 if any not found."""
    if not type_ids:
        return []
    result = await db.execute(
        select(ExerciseType).where(
            ExerciseType.id.in_(type_ids),
            ExerciseType.user_id == user,
        )
    )
    types = list(result.scalars().all())
    if len(types) != len(type_ids):
        raise HTTPException(status_code=400, detail="One or more exercise type IDs are invalid")
    return types


@router.get("", response_model=list[ExerciseOut])
async def list_exercises(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Exercise]:
    result = await db.execute(
        select(Exercise).where(Exercise.user_id == user).order_by(Exercise.created_at)
    )
    return list(result.scalars().all())


@router.post("", response_model=ExerciseOut, status_code=201)
async def create_exercise(
    body: ExerciseCreate,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Exercise:
    types = await _resolve_types(body.type_ids, user, db)
    exercise = Exercise(user_id=user, name=body.name, notes=body.notes)
    exercise.types = types
    db.add(exercise)
    await db.commit()
    await db.refresh(exercise)
    return exercise


@router.patch("/{exercise_id}", response_model=ExerciseOut)
async def update_exercise(
    exercise_id: int,
    body: ExercisePatch,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Exercise:
    exercise = await db.get(Exercise, exercise_id)
    if not exercise or exercise.user_id != user:
        raise HTTPException(status_code=404, detail="Exercise not found")
    data = body.model_dump(exclude_unset=True)
    type_ids = data.pop("type_ids", None)
    for field, value in data.items():
        setattr(exercise, field, value)
    if type_ids is not None:
        exercise.types = await _resolve_types(type_ids, user, db)
    await db.commit()
    await db.refresh(exercise)
    return exercise


@router.delete("/{exercise_id}", status_code=204)
async def delete_exercise(
    exercise_id: int,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    exercise = await db.get(Exercise, exercise_id)
    if not exercise or exercise.user_id != user:
        raise HTTPException(status_code=404, detail="Exercise not found")
    await db.delete(exercise)
    await db.commit()

