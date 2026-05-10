from datetime import date as DateType
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class StepEntryCreate(BaseModel):
    date: DateType
    steps: int


class StepEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: str
    date: DateType
    steps: int
    created_at: datetime
    updated_at: datetime
