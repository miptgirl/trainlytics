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


class CardioSegmentPatch(BaseModel):
    order: int | None = None
    duration_seconds: int | None = None
    distance_meters: float | None = None
    pace_seconds_per_km: float | None = None
    heart_rate_avg: int | None = None


class CardioSegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order: int
    duration_seconds: int
    distance_meters: float | None
    pace_seconds_per_km: float | None
    heart_rate_avg: int | None


class CardioSessionCreate(BaseModel):
    activity_type_id: int | None = None
    total_duration_seconds: int | None = None
    date: DateType
    notes: str | None = None
    segments: list[CardioSegmentCreate]


class CardioSessionPatch(BaseModel):
    activity_type_id: int | None = None
    total_duration_seconds: int | None = None
    date: Optional[DateType] = None
    notes: str | None = None
    segments: list[CardioSegmentCreate] | None = None


class CardioSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    activity_type_id: int | None
    total_duration_seconds: int | None
    date: DateType
    notes: str | None
    created_at: datetime
    segments: list[CardioSegmentOut]
