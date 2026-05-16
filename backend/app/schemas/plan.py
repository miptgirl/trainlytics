from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator


class PlannedCardioSegmentIn(BaseModel):
    segment_order: int
    title: str | None = None
    activity_type_id: int
    duration_secs: int | None = None
    distance_metres: int | None = None
    pace_secs_per_km: int | None = None
    notes: str | None = None


class PlannedCardioSegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    segment_order: int
    title: str | None
    activity_type_id: int
    duration_secs: int | None
    distance_metres: int | None
    pace_secs_per_km: int | None
    notes: str | None


class PlannedSessionIn(BaseModel):
    planned_date: date
    session_type: Literal["strength", "cardio"]
    template_id: int | None = None
    title: str | None = None
    notes: str | None = None
    display_order: int = 0
    segments: list[PlannedCardioSegmentIn] = []

    @model_validator(mode="after")
    def validate_type_fields(self) -> "PlannedSessionIn":
        if self.session_type == "strength" and self.template_id is None:
            raise ValueError("template_id is required for strength sessions")
        if self.session_type == "cardio" and not self.segments:
            raise ValueError("at least one segment is required for cardio sessions")
        return self


class PlannedSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    planned_date: date
    session_type: str
    template_id: int | None
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
