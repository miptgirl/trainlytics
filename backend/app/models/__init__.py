# Import all models here so Alembic autogenerate picks them up
from app.models.ai_request_log import AiRequestLog  # noqa: F401
from app.models.cardio_activity_type import CardioActivityType  # noqa: F401
from app.models.exercise import Exercise  # noqa: F401
from app.models.exercise_type import ExerciseType, exercise_exercise_types  # noqa: F401
from app.models.plan import PlannedCardioSegment, PlannedSession, WeeklyPlan  # noqa: F401
from app.models.session import CardioSegment, CardioSession, StrengthExerciseEntry, StrengthSession, StrengthSet, WorkoutSession  # noqa: F401
from app.models.step import DailySteps  # noqa: F401
from app.models.template import StrengthTemplate, StrengthTemplateExercise, StrengthTemplateSet  # noqa: F401
from app.models.user_settings import UserSettings  # noqa: F401
