from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.exercise_type import ExerciseType

exercise_replacements = Table(
    "exercise_replacements",
    Base.metadata,
    Column("exercise_id", Integer, ForeignKey("exercises.id", ondelete="CASCADE"), primary_key=True),
    Column("replacement_id", Integer, ForeignKey("exercises.id", ondelete="CASCADE"), primary_key=True),
)


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc),
    )
    types: Mapped[list[ExerciseType]] = relationship(
        "ExerciseType",
        secondary="exercise_exercise_types",
        lazy="selectin",
    )
    replacements: Mapped[list[Exercise]] = relationship(
        "Exercise",
        secondary=exercise_replacements,
        primaryjoin=lambda: Exercise.id == exercise_replacements.c.exercise_id,
        secondaryjoin=lambda: Exercise.id == exercise_replacements.c.replacement_id,
        lazy="raise",
    )
