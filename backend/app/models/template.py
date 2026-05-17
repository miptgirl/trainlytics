from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.exercise import Exercise


class StrengthTemplate(Base):
    __tablename__ = "strength_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    exercises: Mapped[list["StrengthTemplateExercise"]] = relationship(
        "StrengthTemplateExercise",
        back_populates="template",
        order_by="StrengthTemplateExercise.order",
        cascade="all, delete-orphan",
    )


class StrengthTemplateExercise(Base):
    __tablename__ = "strength_template_exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("strength_templates.id", ondelete="CASCADE"), nullable=False
    )
    exercise_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exercises.id", ondelete="RESTRICT"), nullable=False
    )
    order: Mapped[int] = mapped_column(Integer, nullable=False)

    template: Mapped["StrengthTemplate"] = relationship(
        "StrengthTemplate", back_populates="exercises"
    )
    exercise: Mapped["Exercise"] = relationship("Exercise")
    sets: Mapped[list["StrengthTemplateSet"]] = relationship(
        "StrengthTemplateSet",
        back_populates="exercise_entry",
        order_by="StrengthTemplateSet.set_number",
        cascade="all, delete-orphan",
    )


class StrengthTemplateSet(Base):
    __tablename__ = "strength_template_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    exercise_entry_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("strength_template_exercises.id", ondelete="CASCADE"),
        nullable=False,
    )
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    exercise_entry: Mapped["StrengthTemplateExercise"] = relationship(
        "StrengthTemplateExercise", back_populates="sets"
    )


class StrengthTemplateHistory(Base):
    __tablename__ = "strength_template_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("strength_templates.id", ondelete="CASCADE"), nullable=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    exercises: Mapped[list["StrengthTemplateHistoryExercise"]] = relationship(
        "StrengthTemplateHistoryExercise",
        back_populates="history",
        order_by="StrengthTemplateHistoryExercise.exercise_order",
        cascade="all, delete-orphan",
    )


class StrengthTemplateHistoryExercise(Base):
    __tablename__ = "strength_template_history_exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    history_id: Mapped[int] = mapped_column(
        ForeignKey("strength_template_history.id", ondelete="CASCADE"), nullable=False
    )
    exercise_id: Mapped[int | None] = mapped_column(
        ForeignKey("exercises.id", ondelete="SET NULL"), nullable=True
    )
    exercise_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    history: Mapped["StrengthTemplateHistory"] = relationship(
        "StrengthTemplateHistory", back_populates="exercises"
    )
    sets: Mapped[list["StrengthTemplateHistorySet"]] = relationship(
        "StrengthTemplateHistorySet",
        back_populates="exercise",
        order_by="StrengthTemplateHistorySet.set_order",
        cascade="all, delete-orphan",
    )
    exercise: Mapped["Exercise"] = relationship("Exercise")


class StrengthTemplateHistorySet(Base):
    __tablename__ = "strength_template_history_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    history_exercise_id: Mapped[int] = mapped_column(
        ForeignKey("strength_template_history_exercises.id", ondelete="CASCADE"),
        nullable=False,
    )
    set_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(nullable=True)

    exercise: Mapped["StrengthTemplateHistoryExercise"] = relationship(
        "StrengthTemplateHistoryExercise", back_populates="sets"
    )
