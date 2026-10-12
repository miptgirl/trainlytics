from datetime import datetime

from pydantic import BaseModel, ConfigDict


class StrengthTemplateSetCreate(BaseModel):
    set_number: int
    reps: int | None = None
    weight_kg: float | None = None


class StrengthTemplateSetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    set_number: int
    reps: int | None
    weight_kg: float | None


class StrengthTemplateExerciseCreate(BaseModel):
    exercise_id: int
    order: int
    sets: list[StrengthTemplateSetCreate]


class StrengthTemplateExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_id: int
    exercise_name: str
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
