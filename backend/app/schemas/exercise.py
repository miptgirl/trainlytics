from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, field_validator

from app.schemas.exercise_type import ExerciseTypeOut


class StackWeightScale(BaseModel):
    """A machine weight stack: the top plate, then equal plates. `plates` counts every position, top plate included."""

    kind: Literal["stack"]
    # At least 1 lb: smaller plates would make the client's position search unbounded in practice
    top_lb: StrictFloat = Field(ge=1, le=50)
    plate_lb: StrictFloat = Field(ge=1, le=50)
    plates: StrictInt | None = Field(default=None, ge=1, le=100)


class IncrementWeightScale(BaseModel):
    """Free weights (barbells, dumbbells): steps of a fixed kg amount, at most 2 decimals."""

    kind: Literal["increment"]
    step_kg: StrictFloat = Field(gt=0, le=20)

    @field_validator("step_kg")
    @classmethod
    def validate_step_decimals(cls, v: float) -> float:
        if round(v, 2) != v:
            raise ValueError("step_kg must have at most 2 decimal places")
        return v


# null on an exercise means the default 10 lb stack (see the client's stepWeight)
WeightScale = Annotated[StackWeightScale | IncrementWeightScale, Field(discriminator="kind")]


class ExerciseCreate(BaseModel):
    name: str
    notes: str | None = None
    type_ids: list[int] = []
    weight_scale: WeightScale | None = None


class ExercisePatch(BaseModel):
    name: str | None = None
    notes: str | None = None
    type_ids: list[int] | None = None
    # Omitted leaves the setting; null clears it
    weight_scale: WeightScale | None = None


class ExerciseRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: str
    name: str
    notes: str | None
    weight_scale: WeightScale | None = None
    created_at: datetime
    types: list[ExerciseTypeOut] = []


class ReplacementAdd(BaseModel):
    replacement_id: int


class SetDefault(BaseModel):
    set_number: int
    reps: int | None
    weight: float | None


class ExerciseDefaultsOut(BaseModel):
    sets: list[SetDefault]
