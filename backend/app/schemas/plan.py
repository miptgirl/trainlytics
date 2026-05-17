from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator


class PlannedCardioSegmentIn(BaseModel):
    segment_order: int
    title: str | None = None
    duration_secs: int | None = None
    distance_metres: int | None = None
    pace_secs_per_km: int | None = None
    notes: str | None = None


class PlannedCardioSegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    segment_order: int
    title: str | None
    duration_secs: int | None
    distance_metres: int | None
    pace_secs_per_km: int | None
    notes: str | None


class PlannedSessionIn(BaseModel):
    planned_date: date
    session_type: Literal["strength", "cardio"]
    template_id: int | None = None
    activity_type_id: int | None = None
    title: str | None = None
    notes: str | None = None
    display_order: int = 0
    segments: list[PlannedCardioSegmentIn] = []

    @model_validator(mode="after")
    def validate_type_fields(self) -> "PlannedSessionIn":
        if self.session_type == "strength" and self.template_id is None:
            raise ValueError("template_id is required for strength sessions")
        if self.session_type == "cardio":
            if self.activity_type_id is None:
                raise ValueError("activity_type_id is required for cardio sessions")
            if not self.segments:
                raise ValueError("at least one segment is required for cardio sessions")
        return self


class PlannedSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    planned_date: date
    session_type: str
    template_id: int | None
    activity_type_id: int | None
    title: str | None
    notes: str | None
    skip_note: str | None
    display_order: int
    segments: list[PlannedCardioSegmentOut]
    status: Literal["planned", "done", "skipped"]
    matched_session_id: int | None


class WeekPlanOut(BaseModel):
    plan_id: int
    week_start: date
    sessions: list[PlannedSessionOut]


class SkipNoteIn(BaseModel):
    skip_note: str | None = None


class WeeklySummaryTotals(BaseModel):
    cardio_distance_km: float
    cardio_duration_min: float
    strength_exercise_count: int
    strength_volume_kg_reps: float


class WeeklySummaryOut(BaseModel):
    planned: WeeklySummaryTotals
    actual: WeeklySummaryTotals


class SetComparisonRow(BaseModel):
    planned_reps: int | None
    planned_weight_kg: float | None
    actual_reps: int | None
    actual_weight_kg: float | None


class ExerciseComparison(BaseModel):
    exercise_id: int | None
    exercise_name: str
    source: Literal["both", "planned_only", "actual_only"]
    planned_volume: float
    actual_volume: float
    sets: list[SetComparisonRow]


class StrengthComparisonOut(BaseModel):
    exercises: list[ExerciseComparison]
    planned_total_volume: float
    actual_total_volume: float


class CardioComparisonOut(BaseModel):
    planned_distance_km: float | None
    actual_distance_km: float | None
    planned_duration_min: float | None
    actual_duration_min: float | None


class SessionComparisonOut(BaseModel):
    planned_session_id: int
    actual_session_id: int
    session_type: Literal["cardio", "strength"]
    cardio: CardioComparisonOut | None = None
    strength: StrengthComparisonOut | None = None
