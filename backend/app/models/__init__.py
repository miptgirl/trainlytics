# Import all models here so Alembic autogenerate picks them up
from app.models.cardio_activity_type import CardioActivityType  # noqa: F401
from app.models.exercise import Exercise  # noqa: F401
from app.models.session import CardioSegment, CardioSession, StrengthExerciseEntry, StrengthSession, StrengthSet, WorkoutSession  # noqa: F401
from app.models.template import StrengthTemplate, StrengthTemplateExercise, StrengthTemplateSet  # noqa: F401
