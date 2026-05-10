"""Service-layer functions for session analytics."""

from __future__ import annotations

from datetime import date as DateType
from datetime import datetime as dt
from datetime import timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cardio_activity_type import CardioActivityType
from app.models.session import CardioSegment, CardioSession, WorkoutSession
from app.schemas.session import PaceTrendPoint


async def get_pace_trends(
    db: AsyncSession,
    user: str,
    weeks: int = 13,
) -> list[PaceTrendPoint]:
    """Aggregate average pace per (week, activity_type, segment_label) bucket.

    Returns one ``PaceTrendPoint`` per unique (week_start, activity_type,
    segment_label) combination, covering the *weeks* most recent weeks
    (Monday-aligned, inclusive of the current week).
    """
    today = DateType.today()
    current_monday = today - timedelta(days=today.weekday())
    next_monday = current_monday + timedelta(weeks=1)
    week_starts = [current_monday - timedelta(weeks=i) for i in range(weeks - 1, -1, -1)]

    range_start = dt(week_starts[0].year, week_starts[0].month, week_starts[0].day, tzinfo=timezone.utc)
    range_end = dt(next_monday.year, next_monday.month, next_monday.day, tzinfo=timezone.utc)

    rows = (
        await db.execute(
            select(
                WorkoutSession.date,
                CardioActivityType.name.label("activity_type_name"),
                CardioSegment.order,
                CardioSegment.title,
                CardioSegment.duration_seconds,
                CardioSegment.distance_meters,
            )
            .join(CardioSession, CardioSession.session_id == WorkoutSession.id)
            .join(CardioSegment, CardioSegment.cardio_session_id == CardioSession.id)
            .outerjoin(CardioActivityType, CardioActivityType.id == CardioSession.activity_type_id)
            .where(
                WorkoutSession.user_id == user,
                WorkoutSession.type == "cardio",
                WorkoutSession.date >= range_start,
                WorkoutSession.date < range_end,
                CardioSegment.distance_meters.isnot(None),
                CardioSegment.distance_meters > 0,
            )
        )
    ).all()

    def week_of(d: dt) -> DateType:
        d_date = d.date() if hasattr(d, "date") else d
        return d_date - timedelta(days=d_date.weekday())

    valid_weeks = set(week_starts)
    pace_acc: dict[tuple[DateType, str, str], tuple[float, int]] = {}

    for row_date, activity_type_name, seg_order, seg_title, dur, dist in rows:
        w = week_of(row_date)
        if w not in valid_weeks:
            continue
        activity_type = activity_type_name or "Unspecified"
        segment_label = seg_title if seg_title else f"Segment {seg_order}"
        pace = dur * 1000.0 / dist
        key = (w, activity_type, segment_label)
        sum_pace, count = pace_acc.get(key, (0.0, 0))
        pace_acc[key] = (sum_pace + pace, count + 1)

    return [
        PaceTrendPoint(
            week_start=w,
            activity_type=at,
            segment_label=sl,
            avg_pace_sec_per_km=round(sum_pace / count),
        )
        for (w, at, sl), (sum_pace, count) in sorted(pace_acc.items())
    ]
