from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.exercise import Exercise, exercise_replacements
from app.models.exercise_type import ExerciseType
from app.models.session import StrengthExerciseEntry, StrengthSession, WorkoutSession
from app.schemas.exercise import ExerciseCreate, ExerciseDefaultsOut, ExerciseOut, ExercisePatch, ExerciseRef, ReplacementAdd, SetDefault

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


@router.get("/{exercise_id}/last-session-defaults", response_model=ExerciseDefaultsOut)
async def get_last_session_defaults(
    exercise_id: int,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ExerciseDefaultsOut:
    exercise = await db.get(Exercise, exercise_id)
    if not exercise or exercise.user_id != user:
        raise HTTPException(status_code=404, detail="Exercise not found")

    result = await db.execute(
        select(StrengthExerciseEntry)
        .join(StrengthSession, StrengthExerciseEntry.strength_session_id == StrengthSession.id)
        .join(WorkoutSession, StrengthSession.session_id == WorkoutSession.id)
        .where(
            StrengthExerciseEntry.exercise_id == exercise_id,
            WorkoutSession.user_id == user,
        )
        .order_by(WorkoutSession.date.desc())
        .limit(1)
        .options(selectinload(StrengthExerciseEntry.sets))
    )
    entry = result.scalar_one_or_none()
    if not entry:
        return ExerciseDefaultsOut(sets=[])

    return ExerciseDefaultsOut(
        sets=[SetDefault(set_number=s.set_number, reps=s.reps, weight=s.weight) for s in entry.sets]
    )


async def _list_replacements(exercise_id: int, db: AsyncSession) -> list[Exercise]:
    result = await db.execute(
        select(Exercise)
        .join(exercise_replacements, Exercise.id == exercise_replacements.c.replacement_id)
        .where(exercise_replacements.c.exercise_id == exercise_id)
        .order_by(Exercise.name)
    )
    return list(result.scalars().all())


@router.get("/{exercise_id}/replacements", response_model=list[ExerciseRef])
async def list_replacements(
    exercise_id: int,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Exercise]:
    exercise = await db.get(Exercise, exercise_id)
    if not exercise or exercise.user_id != user:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return await _list_replacements(exercise_id, db)


@router.post("/{exercise_id}/replacements", response_model=list[ExerciseRef], status_code=201)
async def add_replacement(
    exercise_id: int,
    body: ReplacementAdd,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Exercise]:
    exercise = await db.get(Exercise, exercise_id)
    if not exercise or exercise.user_id != user:
        raise HTTPException(status_code=404, detail="Exercise not found")

    if body.replacement_id == exercise_id:
        raise HTTPException(status_code=400, detail="An exercise cannot be its own replacement")

    replacement = await db.get(Exercise, body.replacement_id)
    if not replacement or replacement.user_id != user:
        raise HTTPException(status_code=404, detail="Replacement exercise not found")

    existing = await db.execute(
        select(exercise_replacements).where(
            exercise_replacements.c.exercise_id == exercise_id,
            exercise_replacements.c.replacement_id == body.replacement_id,
        )
    )
    if existing.first() is not None:
        raise HTTPException(status_code=409, detail="Replacement already exists")

    await db.execute(
        insert(exercise_replacements).values(exercise_id=exercise_id, replacement_id=body.replacement_id)
    )
    await db.commit()
    return await _list_replacements(exercise_id, db)


@router.delete("/{exercise_id}/replacements/{replacement_id}", response_model=list[ExerciseRef])
async def remove_replacement(
    exercise_id: int,
    replacement_id: int,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Exercise]:
    exercise = await db.get(Exercise, exercise_id)
    if not exercise or exercise.user_id != user:
        raise HTTPException(status_code=404, detail="Exercise not found")

    result = await db.execute(
        select(exercise_replacements).where(
            exercise_replacements.c.exercise_id == exercise_id,
            exercise_replacements.c.replacement_id == replacement_id,
        )
    )
    if result.first() is None:
        raise HTTPException(status_code=404, detail="Replacement not found")

    await db.execute(
        delete(exercise_replacements).where(
            exercise_replacements.c.exercise_id == exercise_id,
            exercise_replacements.c.replacement_id == replacement_id,
        )
    )
    await db.commit()
    return await _list_replacements(exercise_id, db)


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

