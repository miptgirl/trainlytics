from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    username: Mapped[str] = mapped_column(String, primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    experience_level: Mapped[str | None] = mapped_column(String, nullable=True)
    goals: Mapped[list | None] = mapped_column(JSON, nullable=True)
    injury_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    coach_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    anthropic_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    openai_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_provider: Mapped[str | None] = mapped_column(String, nullable=True)
    ai_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Strava OAuth tokens (encrypted)
    strava_access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    strava_refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    strava_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    strava_athlete_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    strava_last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    strava_sync_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Health metric preferences (default all enabled)
    health_metric_resting_hr: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    health_metric_hrv: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    health_metric_weight: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    health_metric_sleep: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    health_metric_vo2_max: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    health_metric_active_energy: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
