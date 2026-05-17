from sqlalchemy import Integer, JSON, String, Text
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
