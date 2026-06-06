from datetime import date

from sqlalchemy import Date, Float, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BodyMetrics(Base):
    __tablename__ = "body_metrics"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    resting_hr_bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    hrv_sdnn_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_quality: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vo2_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    active_energy_kcal: Mapped[float | None] = mapped_column(Float, nullable=True)
