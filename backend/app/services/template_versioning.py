from sqlalchemy.orm import Session

from app.models.template import StrengthTemplate, StrengthTemplateHistoryExercise, StrengthTemplateHistorySet
from app.models.template import StrengthTemplateHistory


def _write_template_history(db: Session, template: StrengthTemplate) -> None:
    """Snapshot the current template exercises/sets into a history row. Caller commits."""
    history = StrengthTemplateHistory(
        template_id=template.id,
        version=template.current_version,
    )
    db.add(history)
    db.flush()  # populate history.id before inserting children

    for ex in template.exercises:
        hist_ex = StrengthTemplateHistoryExercise(
            history_id=history.id,
            exercise_id=ex.exercise_id,
            exercise_order=ex.order,
        )
        db.add(hist_ex)
        db.flush()

        for s in ex.sets:
            db.add(
                StrengthTemplateHistorySet(
                    history_exercise_id=hist_ex.id,
                    set_order=s.set_number,
                    reps=s.reps,
                    weight_kg=s.weight_kg,
                )
            )
