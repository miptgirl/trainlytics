from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.template import (
    StrengthTemplate,
    StrengthTemplateExercise,
    StrengthTemplateHistory,
    StrengthTemplateHistoryExercise,
    StrengthTemplateHistorySet,
)


async def _write_template_history(db: AsyncSession, template: StrengthTemplate) -> None:
    """Snapshot the current template exercises/sets into a history row. Caller commits."""
    result = await db.execute(
        select(StrengthTemplateExercise)
        .where(StrengthTemplateExercise.template_id == template.id)
        .options(selectinload(StrengthTemplateExercise.sets))
        .order_by(StrengthTemplateExercise.order)
    )
    exercises = result.scalars().all()

    history = StrengthTemplateHistory(
        template_id=template.id,
        version=template.current_version,
    )
    db.add(history)
    await db.flush()

    for ex in exercises:
        hist_ex = StrengthTemplateHistoryExercise(
            history_id=history.id,
            exercise_id=ex.exercise_id,
            exercise_order=ex.order,
        )
        db.add(hist_ex)
        await db.flush()
        for s in ex.sets:
            db.add(
                StrengthTemplateHistorySet(
                    history_exercise_id=hist_ex.id,
                    set_order=s.set_number,
                    reps=s.reps,
                    weight_kg=s.weight_kg,
                )
            )
