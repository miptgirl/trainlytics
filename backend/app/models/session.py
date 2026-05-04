from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.exercise import Exercise


class SessionType(str, Enum):
    cardio = "cardio"
    strength = "strength"


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    calories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc),
    )

    cardio_session: Mapped["CardioSession | None"] = relationship(
        "CardioSession", back_populates="workout_session", uselist=False, cascade="all, delete-orphan"
    )
    strength_session: Mapped["StrengthSession | None"] = relationship(
        "StrengthSession", back_populates="workout_session", uselist=False, cascade="all, delete-orphan"
    )


class CardioSession(Base):
    __tablename__ = "cardio_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    activity_type_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("cardio_activity_types.id", ondelete="SET NULL"), nullable=True
    )
    total_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    workout_session: Mapped["WorkoutSession"] = relationship(
        "WorkoutSession", back_populates="cardio_session"
    )
    segments: Mapped[list["CardioSegment"]] = relationship(
        "CardioSegment", back_populates="cardio_session", order_by="CardioSegment.order", cascade="all, delete-orphan"
    )


class CardioSegment(Base):
    __tablename__ = "cardio_segments"

    id: Mapped[int] = mapped_column(primary_key=True)
    cardio_session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("cardio_sessions.id", ondelete="CASCADE"), nullable=False
    )
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    distance_meters: Mapped[float | None] = mapped_column(nullable=True)
    pace_seconds_per_km: Mapped[float | None] = mapped_column(nullable=True)
    heart_rate_avg: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)

    cardio_session: Mapped["CardioSession"] = relationship(
        "CardioSession", back_populates="segments"
    )


class StrengthSession(Base):
    __tablename__ = "strength_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    workout_session: Mapped["WorkoutSession"] = relationship(
        "WorkoutSession", back_populates="strength_session"
    )
    exercise_entries: Mapped[list["StrengthExerciseEntry"]] = relationship(
        "StrengthExerciseEntry",
        back_populates="strength_session",
        order_by="StrengthExerciseEntry.order",
        cascade="all, delete-orphan",
    )


class StrengthExerciseEntry(Base):
    __tablename__ = "strength_exercise_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    strength_session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("strength_sessions.id", ondelete="CASCADE"), nullable=False
    )
    exercise_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exercises.id", ondelete="RESTRICT"), nullable=False
    )
    order: Mapped[int] = mapped_column(Integer, nullable=False)

    strength_session: Mapped["StrengthSession"] = relationship(
        "StrengthSession", back_populates="exercise_entries"
    )
    exercise: Mapped["Exercise"] = relationship("Exercise")
    sets: Mapped[list["StrengthSet"]] = relationship(
        "StrengthSet",
        back_populates="exercise_entry",
        order_by="StrengthSet.set_number",
        cascade="all, delete-orphan",
    )


class StrengthSet(Base):
    __tablename__ = "strength_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    exercise_entry_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("strength_exercise_entries.id", ondelete="CASCADE"), nullable=False
    )
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight: Mapped[float | None] = mapped_column(nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    exercise_entry: Mapped["StrengthExerciseEntry"] = relationship(
        "StrengthExerciseEntry", back_populates="sets"
    )
