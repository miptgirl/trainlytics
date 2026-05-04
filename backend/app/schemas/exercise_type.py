from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ExerciseTypeCreate(BaseModel):
    name: str


class ExerciseTypePatch(BaseModel):
    name: str | None = None


class ExerciseTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: str
    name: str
    created_at: datetime
