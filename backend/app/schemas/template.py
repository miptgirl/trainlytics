from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.exercise import Measure
from app.schemas.session import MAX_SET_DURATION_SECONDS, RepsOrDuration


class StrengthTemplateSetCreate(RepsOrDuration, BaseModel):
    set_number: int
    reps: int | None = None
    weight_kg: float | None = None
    duration_seconds: int | None = Field(default=None, ge=1, le=MAX_SET_DURATION_SECONDS)


class StrengthTemplateSetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    set_number: int
    reps: int | None
    weight_kg: float | None
    duration_seconds: int | None = None


class StrengthTemplateExerciseCreate(BaseModel):
    exercise_id: int
    order: int
    sets: list[StrengthTemplateSetCreate]


class StrengthTemplateExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_id: int
    exercise_name: str
    # The exercise's measure as it is now, so a form prefilled from the template can
    # convert sets entered under the other measure (the sets are stored as entered)
    measure: Measure = "reps"
    order: int
    sets: list[StrengthTemplateSetOut]


class StrengthTemplateCreate(BaseModel):
    name: str
    exercises: list[StrengthTemplateExerciseCreate]


class StrengthTemplateUpdate(BaseModel):
    name: str | None = None
    exercises: list[StrengthTemplateExerciseCreate] | None = None


class StrengthTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: datetime
    updated_at: datetime
    exercises: list[StrengthTemplateExerciseOut]


class StrengthTemplateSummary(BaseModel):
    id: int
    name: str
    exercise_count: int
    created_at: datetime
    updated_at: datetime
