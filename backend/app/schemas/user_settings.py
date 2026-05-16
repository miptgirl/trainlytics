from typing import Literal

from pydantic import BaseModel


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
    has_anthropic_key: bool = False
    has_openai_key: bool = False
    ai_provider: str | None = None


class UserSettingsPatch(BaseModel):
    display_name: str | None = None
    birth_year: int | None = None
    experience_level: str | None = None
    goals: list[GoalItem] | None = None
    injury_notes: str | None = None
    coach_notes: str | None = None
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    ai_provider: str | None = None
