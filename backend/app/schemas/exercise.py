from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.exercise_type import ExerciseTypeOut


class ExerciseCreate(BaseModel):
    name: str
    notes: str | None = None
    type_ids: list[int] = []


class ExercisePatch(BaseModel):
    name: str | None = None
    notes: str | None = None
    type_ids: list[int] | None = None


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: str
    name: str
    notes: str | None
    created_at: datetime
    types: list[ExerciseTypeOut] = []
