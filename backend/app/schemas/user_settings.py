from typing import Literal

from pydantic import BaseModel, field_validator


class GoalItem(BaseModel):
    text: str
    priority: Literal["high", "medium", "low"]


class UserSettingsOut(BaseModel):
    display_name: str | None = None
    birth_year: int | None = None
    experience_level: str | None = None
    goals: list[GoalItem] = []
    injury_notes: str | None = None
    coach_notes: str | None = None
    ai_provider: str | None = None
    ai_key_configured: bool = False


class UserSettingsPatch(BaseModel):
    display_name: str | None = None
    birth_year: int | None = None
    experience_level: str | None = None
    goals: list[GoalItem] | None = None
    injury_notes: str | None = None
    coach_notes: str | None = None
    ai_provider: str | None = None
    ai_key: str | None = None

    @field_validator("ai_provider")
    @classmethod
    def validate_ai_provider(cls, v: str | None) -> str | None:
        if v is not None and v not in ("anthropic", "openai"):
            raise ValueError("ai_provider must be 'anthropic' or 'openai'")
        return v
