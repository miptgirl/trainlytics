from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CardioActivityTypeCreate(BaseModel):
    name: str


class CardioActivityTypePatch(BaseModel):
    name: str | None = None


class CardioActivityTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: str
    name: str
    created_at: datetime
