from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, StrictInt, field_validator

# Workout mode rest timer, in seconds. The default lives in the client, which
# also needs it when null (never set) comes back
REST_SECONDS_MIN = 15
REST_SECONDS_MAX = 600
REST_SECONDS_STEP = 5


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

    # Strava connection state
    strava_configured: bool = False
    strava_connected: bool = False
    strava_athlete_name: str | None = None
    strava_athlete_avatar_url: str | None = None
    strava_last_synced_at: datetime | None = None
    strava_sync_start_date: date | None = None

    # Health metric preferences
    health_metric_resting_hr: bool = True
    health_metric_hrv: bool = True
    health_metric_weight: bool = True
    health_metric_sleep: bool = True
    health_metric_vo2_max: bool = True
    health_metric_active_energy: bool = True

    # null: never set, the client applies its default
    rest_seconds: int | None = None

    # Server capability: POST /debug/sql is mounted (local dev only), so Profile offers it
    debug_sql_available: bool = False


class UserSettingsPatch(BaseModel):
    display_name: str | None = None
    birth_year: int | None = None
    experience_level: str | None = None
    goals: list[GoalItem] | None = None
    injury_notes: str | None = None
    coach_notes: str | None = None
    ai_provider: str | None = None
    ai_key: str | None = None
    strava_sync_start_date: date | None = None

    # Health metric preferences
    health_metric_resting_hr: bool | None = None
    health_metric_hrv: bool | None = None
    health_metric_weight: bool | None = None
    health_metric_sleep: bool | None = None
    health_metric_vo2_max: bool | None = None
    health_metric_active_energy: bool | None = None

    # null resets to "never set"; strict: true, "90" and 90.0 are refused
    rest_seconds: StrictInt | None = None

    @field_validator("rest_seconds")
    @classmethod
    def validate_rest_seconds(cls, v: int | None) -> int | None:
        if v is not None and (
            not REST_SECONDS_MIN <= v <= REST_SECONDS_MAX or v % REST_SECONDS_STEP != 0
        ):
            raise ValueError(
                f"rest_seconds must be {REST_SECONDS_MIN}–{REST_SECONDS_MAX} seconds "
                f"in steps of {REST_SECONDS_STEP}"
            )
        return v

    @field_validator("ai_provider")
    @classmethod
    def validate_ai_provider(cls, v: str | None) -> str | None:
        if v is not None and v not in ("anthropic", "openai"):
            raise ValueError("ai_provider must be 'anthropic' or 'openai'")
        return v
