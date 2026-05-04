from datetime import date as DateType
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CardioSegmentCreate(BaseModel):
    order: int
    duration_seconds: int
    distance_meters: float | None = None
    pace_seconds_per_km: float | None = None
    heart_rate_avg: int | None = None
    title: str | None = None


class CardioSegmentPatch(BaseModel):
    order: int | None = None
    duration_seconds: int | None = None
    distance_meters: float | None = None
    pace_seconds_per_km: float | None = None
    heart_rate_avg: int | None = None
    title: str | None = None


class CardioSegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order: int
    duration_seconds: int
    distance_meters: float | None
    pace_seconds_per_km: float | None
    heart_rate_avg: int | None
    title: str | None = None


class CardioSessionCreate(BaseModel):
    activity_type_id: int | None = None
    total_duration_seconds: int | None = None
    date: datetime
    notes: str | None = None
    title: str | None = None
    calories: int | None = None
    segments: list[CardioSegmentCreate]


class CardioSessionPatch(BaseModel):
    activity_type_id: int | None = None
    total_duration_seconds: int | None = None
    date: Optional[datetime] = None
    notes: str | None = None
    title: str | None = None
    calories: int | None = None
    segments: list[CardioSegmentCreate] | None = None


class CardioSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    activity_type_id: int | None
    total_duration_seconds: int | None
    date: datetime
    notes: str | None
    title: str | None = None
    calories: int | None = None
    created_at: datetime
    segments: list[CardioSegmentOut]


# ── Strength ──────────────────────────────────────────────────────────────────

class StrengthSetCreate(BaseModel):
    set_number: int
    reps: int | None = None
    weight: float | None = None
    notes: str | None = None


class StrengthSetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    set_number: int
    reps: int | None
    weight: float | None
    notes: str | None


class StrengthExerciseEntryCreate(BaseModel):
    exercise_id: int
    order: int
    sets: list[StrengthSetCreate]


class StrengthExerciseEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_id: int
    exercise_name: str
    order: int
    sets: list[StrengthSetOut]


class StrengthSessionCreate(BaseModel):
    date: datetime
    notes: str | None = None
    title: str | None = None
    calories: int | None = None
    duration_seconds: int | None = None
    exercises: list[StrengthExerciseEntryCreate]


class StrengthSessionPatch(BaseModel):
    date: Optional[datetime] = None
    notes: str | None = None
    title: str | None = None
    calories: int | None = None
    duration_seconds: int | None = None
    exercises: list[StrengthExerciseEntryCreate] | None = None


class StrengthSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    date: datetime
    notes: str | None
    title: str | None = None
    calories: int | None = None
    duration_seconds: int | None = None
    created_at: datetime
    exercises: list[StrengthExerciseEntryOut]


class SessionSummaryOut(BaseModel):
    """Lightweight session row for the history list."""

    id: int
    type: str
    date: datetime
    notes: str | None
    title: str | None = None
    calories: int | None = None
    created_at: datetime
    # cardio summary
    total_duration_seconds: int | None = None
    total_distance_meters: float | None = None
    # strength summary
    total_sets: int | None = None
    exercise_count: int | None = None
    total_volume: float | None = None
    duration_seconds: int | None = None


class SessionListOut(BaseModel):
    items: list[SessionSummaryOut]
    total: int
    page: int
    page_size: int


# ── Analytics ─────────────────────────────────────────────────────────────────

class WeeklyActivitySummary(BaseModel):
    minutes: int
    calories: int


class WeeklySummaryOut(BaseModel):
    cardio: WeeklyActivitySummary
    strength: WeeklyActivitySummary


class TrainingTrendPoint(BaseModel):
    week_start: DateType
    cardio_minutes: int
    strength_minutes: int
    cardio_calories: int
    strength_calories: int
