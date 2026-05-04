from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.exercise import Exercise
from app.models.template import StrengthTemplate, StrengthTemplateExercise, StrengthTemplateSet
from app.schemas.template import (
    StrengthTemplateCreate,
    StrengthTemplateRead,
    StrengthTemplateSummary,
    StrengthTemplateUpdate,
)

router = APIRouter(prefix="/templates/strength", tags=["templates"])

_TEMPLATE_LOAD = (
    selectinload(StrengthTemplate.exercises)
    .selectinload(StrengthTemplateExercise.sets),
    selectinload(StrengthTemplate.exercises)
    .selectinload(StrengthTemplateExercise.exercise),
)


async def _load_template(db: AsyncSession, template_id: int, user: str) -> StrengthTemplate:
    result = await db.execute(
        select(StrengthTemplate)
        .where(StrengthTemplate.id == template_id, StrengthTemplate.user_id == user)
        .options(*_TEMPLATE_LOAD)
        .execution_options(populate_existing=True)
    )
    tmpl = result.scalar_one_or_none()
    if tmpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


def _build_template_out(tmpl: StrengthTemplate) -> StrengthTemplateRead:
    from app.schemas.template import StrengthTemplateExerciseOut, StrengthTemplateSetOut

    exercises_out = []
    for entry in tmpl.exercises:
        exercises_out.append(
            StrengthTemplateExerciseOut(
                id=entry.id,
                exercise_id=entry.exercise_id,
                exercise_name=entry.exercise.name,
                order=entry.order,
                sets=[
                    StrengthTemplateSetOut(
                        id=s.id,
                        set_number=s.set_number,
                        reps=s.reps,
                        weight_kg=s.weight_kg,
                        notes=s.notes,
                    )
                    for s in entry.sets
                ],
            )
        )
    return StrengthTemplateRead(
        id=tmpl.id,
        name=tmpl.name,
        notes=tmpl.notes,
        created_at=tmpl.created_at,
        updated_at=tmpl.updated_at,
        exercises=exercises_out,
    )


async def _validate_exercises(
    db: AsyncSession, exercise_entries: list, user: str
) -> None:
    exercise_ids = [e.exercise_id for e in exercise_entries]
    result = await db.execute(
        select(Exercise).where(Exercise.id.in_(exercise_ids), Exercise.user_id == user)
    )
    found = {ex.id for ex in result.scalars().all()}
    missing = set(exercise_ids) - found
    if missing:
        raise HTTPException(status_code=400, detail=f"Exercise(s) not found: {missing}")


@router.post("", response_model=StrengthTemplateRead, status_code=201)
async def create_template(
    body: StrengthTemplateCreate,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StrengthTemplateRead:
    await _validate_exercises(db, body.exercises, user)

    tmpl = StrengthTemplate(user_id=user, name=body.name, notes=body.notes)
    db.add(tmpl)
    await db.flush()

    for entry in body.exercises:
        ee = StrengthTemplateExercise(
            template_id=tmpl.id,
            exercise_id=entry.exercise_id,
            order=entry.order,
        )
        db.add(ee)
        await db.flush()
        for s in entry.sets:
            db.add(StrengthTemplateSet(exercise_entry_id=ee.id, **s.model_dump()))

    await db.commit()
    return _build_template_out(await _load_template(db, tmpl.id, user))


@router.get("", response_model=list[StrengthTemplateSummary])
async def list_templates(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[StrengthTemplateSummary]:
    result = await db.execute(
        select(StrengthTemplate)
        .where(StrengthTemplate.user_id == user)
        .options(selectinload(StrengthTemplate.exercises))
        .order_by(StrengthTemplate.created_at)
    )
    templates = result.scalars().all()
    return [
        StrengthTemplateSummary(
            id=t.id,
            name=t.name,
            notes=t.notes,
            exercise_count=len(t.exercises),
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in templates
    ]


@router.get("/{template_id}", response_model=StrengthTemplateRead)
async def get_template(
    template_id: int,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StrengthTemplateRead:
    return _build_template_out(await _load_template(db, template_id, user))


@router.patch("/{template_id}", response_model=StrengthTemplateRead)
async def update_template(
    template_id: int,
    body: StrengthTemplateUpdate,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StrengthTemplateRead:
    tmpl = await _load_template(db, template_id, user)

    if body.name is not None:
        tmpl.name = body.name
    if body.notes is not None:
        tmpl.notes = body.notes

    if body.exercises is not None:
        await _validate_exercises(db, body.exercises, user)

        entry_ids = [e.id for e in tmpl.exercises]
        if entry_ids:
            await db.execute(
                delete(StrengthTemplateSet).where(
                    StrengthTemplateSet.exercise_entry_id.in_(entry_ids)
                )
            )
        await db.execute(
            delete(StrengthTemplateExercise).where(
                StrengthTemplateExercise.template_id == tmpl.id
            )
        )
        await db.flush()

        for entry in body.exercises:
            ee = StrengthTemplateExercise(
                template_id=tmpl.id,
                exercise_id=entry.exercise_id,
                order=entry.order,
            )
            db.add(ee)
            await db.flush()
            for s in entry.sets:
                db.add(StrengthTemplateSet(exercise_entry_id=ee.id, **s.model_dump()))

    tmpl.updated_at = datetime.now(timezone.utc)
    await db.commit()
    db.expunge_all()
    return _build_template_out(await _load_template(db, template_id, user))


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: int,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    tmpl = await db.get(StrengthTemplate, template_id)
    if tmpl is None or tmpl.user_id != user:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(tmpl)
    await db.commit()
