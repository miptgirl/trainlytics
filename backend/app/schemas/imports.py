from datetime import date as DateType, datetime
from typing import Any

from pydantic import BaseModel, field_validator


class PendingImportOut(BaseModel):
    id: int
    source: str
    status: str
    mapped_session: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class PendingImportListOut(BaseModel):
    items: list[PendingImportOut]
    total_pending: int


class ImportConflict(BaseModel):
    session_id: int
    date: str | None
    duration: int | None


class ImportAcceptOut(BaseModel):
    session_id: int


class ImportPatch(BaseModel):
    date: str | None = None
    activity_type: str | None = None
    title: str | None = None
    notes: str | None = None

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str | None) -> str | None:
        if v is not None:
            DateType.fromisoformat(v)  # raises ValueError → Pydantic turns it into 422
        return v


class AcceptAllOut(BaseModel):
    accepted: int
    conflicts: list[dict[str, Any]]
