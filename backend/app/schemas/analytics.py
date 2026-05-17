from __future__ import annotations

from datetime import date as DateType

from pydantic import BaseModel


class SummaryOut(BaseModel):
    total_sessions: int
    total_minutes: int
    total_distance_km: float


class StrengthProgressionPoint(BaseModel):
    date: DateType
    max_weight: float
    total_volume: float


class PersonalRecord(BaseModel):
    exercise_id: int
    exercise_name: str
    heaviest_weight: float
    best_reps_at_heaviest: int
    best_single_set_volume: float


class RecordsGroupOut(BaseModel):
    tag: str
    records: list[PersonalRecord]


class VolumeByTagPoint(BaseModel):
    week_start: DateType
    tag: str
    total_volume: float


class CardioTimeSplitPoint(BaseModel):
    activity_type: str
    total_minutes: float


class WalkSegmentsPoint(BaseModel):
    date: DateType
    session_title: str | None
    walk_segment_count: int


class DistanceProgressionPoint(BaseModel):
    month_start: DateType
    activity_type: str
    cumulative_distance_km: float


class TrainingLoadPoint(BaseModel):
    week_start: DateType
    total_minutes: int
    total_distance_km: float


class TrainingLoadWindow(BaseModel):
    window: int
    data: list[TrainingLoadPoint]


class ReadinessTrendPoint(BaseModel):
    week_start: DateType
    avg_wellbeing: float | None
    avg_rpe: float | None


class ReadinessCorrelationPoint(BaseModel):
    date: DateType
    wellbeing: int
    rpe: int
    type: str


class HeatmapDay(BaseModel):
    date: DateType
    session_types: list[str]


class OverviewTrendsPoint(BaseModel):
    week_start: DateType
    session_count: int
    total_minutes: int
    total_volume: float


class ExercisesByTypePoint(BaseModel):
    week_start: DateType
    muscle_group_tag: str
    exercise_count: int


class PlanAdherencePoint(BaseModel):
    week_start: DateType
    completion_pct: float | None
    strength_volume_delta: float | None
    cardio_distance_delta: float | None


class HrZoneTrendsRow(BaseModel):
    week_start: DateType
    z1_minutes: float
    z2_minutes: float
    z3_minutes: float
    z4_minutes: float
    z5_minutes: float
