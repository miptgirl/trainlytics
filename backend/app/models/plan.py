from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class WeeklyPlan(Base):
    __tablename__ = "weekly_plans"
    __table_args__ = (UniqueConstraint("user_id", "week_start", name="uq_weekly_plan_user_week"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc),
    )

    sessions: Mapped[list["PlannedSession"]] = relationship(
        "PlannedSession",
        back_populates="plan",
        order_by="PlannedSession.planned_date, PlannedSession.display_order",
        cascade="all, delete-orphan",
    )


class PlannedSession(Base):
    __tablename__ = "planned_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("weekly_plans.id", ondelete="CASCADE"), nullable=False
    )
    planned_date: Mapped[date] = mapped_column(Date, nullable=False)
    session_type: Mapped[str] = mapped_column(String(20), nullable=False)
    template_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("strength_templates.id", ondelete="SET NULL"), nullable=True
    )
    template_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    activity_type_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("cardio_activity_types.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    skip_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    plan: Mapped["WeeklyPlan"] = relationship("WeeklyPlan", back_populates="sessions")
    cardio_segments: Mapped[list["PlannedCardioSegment"]] = relationship(
        "PlannedCardioSegment",
        back_populates="planned_session",
        order_by="PlannedCardioSegment.segment_order",
        cascade="all, delete-orphan",
    )


class PlannedCardioSegment(Base):
    __tablename__ = "planned_cardio_segments"

    id: Mapped[int] = mapped_column(primary_key=True)
    planned_session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("planned_sessions.id", ondelete="CASCADE"), nullable=False
    )
    segment_order: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_secs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance_metres: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pace_secs_per_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    planned_session: Mapped["PlannedSession"] = relationship(
        "PlannedSession", back_populates="cardio_segments"
    )
