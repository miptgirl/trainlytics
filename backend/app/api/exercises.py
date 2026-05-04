from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.exercise import Exercise
from app.schemas.exercise import ExerciseCreate, ExerciseOut, ExercisePatch

router = APIRouter(prefix="/exercises", tags=["exercises"])


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
    exercise = Exercise(user_id=user, name=body.name, notes=body.notes)
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
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(exercise, field, value)
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
