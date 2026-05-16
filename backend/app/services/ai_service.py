"""AI service: provider dispatch, prompt building, and request logging.

All AI calls go through `call_ai()` which:
  - Prepends the athlete context block to the prompt
  - Dispatches to Anthropic (Claude Sonnet) or OpenAI (GPT-4o)
  - Measures wall-clock duration
  - Writes a row to ai_request_logs regardless of success or failure
  - Never raises from log-write failures
"""

from __future__ import annotations

import datetime
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_request_log import AiRequestLog
from app.models.session import (
    CardioSession,
    StrengthExerciseEntry,
    StrengthSession,
    StrengthSet,
    WorkoutSession,
)
from app.models.exercise import Exercise
from app.models.user_settings import UserSettings
from app.services.crypto import InvalidToken, decrypt

# Lazy imports used inside functions to avoid circular imports:
# app.models.plan, app.models.cardio_activity_type

# ── Model identifiers ─────────────────────────────────────────────────────────

ANTHROPIC_MODEL = "claude-sonnet-4-5"
OPENAI_MODEL = "gpt-4o"


# ── Provider resolution ───────────────────────────────────────────────────────

async def get_active_provider(username: str, db: AsyncSession) -> tuple[str, str] | None:
    """Return (provider, decrypted_key) for the user, or None if no key is set."""
    result = await db.execute(select(UserSettings).where(UserSettings.username == username))
    row = result.scalar_one_or_none()
    if row is None:
        return None

    # Determine which provider to use
    preferred = row.ai_provider or "anthropic"
    # Try preferred first, then the other
    candidates: list[tuple[str, str | None]] = []
    if preferred == "anthropic":
        candidates = [("anthropic", row.anthropic_api_key_encrypted), ("openai", row.openai_api_key_encrypted)]
    else:
        candidates = [("openai", row.openai_api_key_encrypted), ("anthropic", row.anthropic_api_key_encrypted)]

    for provider, ciphertext in candidates:
        if ciphertext:
            try:
                key = decrypt(ciphertext)
                return (provider, key)
            except (InvalidToken, Exception):
                # Key changed or corrupted — treat as missing
                continue

    return None


# ── Athlete context block ─────────────────────────────────────────────────────

def build_athlete_context_block(row: UserSettings | None) -> str:
    """Assemble the 'Athlete profile:' context block from user settings.

    Fields are omitted when not set — no blank lines for empty fields.
    """
    if row is None:
        return ""

    lines: list[str] = ["Athlete profile:"]

    if row.experience_level:
        lines.append(f"- Experience: {row.experience_level}")

    if row.birth_year:
        age = datetime.date.today().year - row.birth_year
        lines.append(f"- Age: {age}")

    if row.goals:
        goal_lines = []
        priority_order = {"high": 0, "medium": 1, "low": 2}
        sorted_goals = sorted(row.goals, key=lambda g: priority_order.get(g.get("priority", "low"), 2))
        for g in sorted_goals:
            goal_lines.append(f"    [{g.get('priority', 'medium')}] {g.get('text', '')}")
        if goal_lines:
            lines.append("- Goals:")
            lines.extend(goal_lines)

    if row.injury_notes:
        lines.append(f"- Ongoing limitations: {row.injury_notes}")

    if row.coach_notes:
        lines.append(f"- Notes: {row.coach_notes}")

    if len(lines) == 1:
        # No fields were set
        return ""

    return "\n".join(lines)


# ── Set / segment compaction ──────────────────────────────────────────────────

def compact_sets(sets: list[Any]) -> str:
    """Collapse consecutive identical (reps, weight) sets into N×reps@weight notation.

    Each element must have .reps and .weight attributes (or dict keys).
    """
    if not sets:
        return ""

    def _reps(s: Any) -> int | None:
        return s.reps if hasattr(s, "reps") else s.get("reps")

    def _weight(s: Any) -> float | None:
        return s.weight if hasattr(s, "weight") else s.get("weight_kg") or s.get("weight")

    parts: list[str] = []
    i = 0
    while i < len(sets):
        r, w = _reps(sets[i]), _weight(sets[i])
        j = i + 1
        while j < len(sets) and _reps(sets[j]) == r and _weight(sets[j]) == w:
            j += 1
        count = j - i
        w_str = f"{w:g}" if w is not None else "0"
        r_str = str(r) if r is not None else "0"
        if count == 1:
            parts.append(f"{r_str}@{w_str}kg")
        else:
            parts.append(f"{count}×{r_str}@{w_str}kg")
        i = j

    return ", ".join(parts)


def compact_cardio_segments(segments: list[Any]) -> str:
    """Collapse consecutive identical cardio segments.

    Each element must have .duration_seconds, .distance_meters, .pace_seconds_per_km.
    """
    if not segments:
        return ""

    def _key(s: Any) -> tuple:
        dist = s.distance_meters if hasattr(s, "distance_meters") else s.get("distance_meters")
        pace = s.pace_seconds_per_km if hasattr(s, "pace_seconds_per_km") else s.get("pace_seconds_per_km")
        dur = s.duration_seconds if hasattr(s, "duration_seconds") else s.get("duration_seconds")
        return (dist, pace, dur)

    def _format_pace(seconds_per_km: float | None) -> str:
        if seconds_per_km is None:
            return "?"
        mins, secs = divmod(int(seconds_per_km), 60)
        return f"{mins}:{secs:02d}/km"

    def _format_dist(meters: float | None) -> str:
        if meters is None:
            return "?"
        km = meters / 1000
        return f"{km:g}km"

    parts: list[str] = []
    i = 0
    while i < len(segments):
        key = _key(segments[i])
        j = i + 1
        while j < len(segments) and _key(segments[j]) == key:
            j += 1
        count = j - i
        dist, pace, _ = key
        dist_str = _format_dist(dist)
        pace_str = _format_pace(pace)
        if count == 1:
            parts.append(f"{dist_str} in {pace_str}")
        else:
            parts.append(f"{count}×{dist_str} in {pace_str}")
        i = j

    return "; ".join(parts)


def format_planned_cardio_session(session_title: str | None, segments: list[Any]) -> str:
    """Format a planned cardio session for use in an AI prompt.

    Each segment element must expose (or dict-key) activity_type_name, distance_metres,
    duration_secs, pace_secs_per_km, and title.
    """
    header = f"Planned cardio session: {session_title or 'Untitled'}"
    lines: list[str] = [header]
    for i, seg in enumerate(segments, 1):
        if hasattr(seg, "__getitem__"):
            name = seg.get("activity_type_name", "Unknown")
            dist = seg.get("distance_metres")
            dur = seg.get("duration_secs")
            pace = seg.get("pace_secs_per_km")
            title = seg.get("title")
        else:
            name = getattr(seg, "activity_type_name", "Unknown")
            dist = getattr(seg, "distance_metres", None)
            dur = getattr(seg, "duration_secs", None)
            pace = getattr(seg, "pace_secs_per_km", None)
            title = getattr(seg, "title", None)

        label = title or name
        parts: list[str] = [f"  Segment {i}: {label}"]
        if dist is not None:
            parts.append(f"{dist / 1000:.2g} km")
        if dur is not None:
            mins = dur / 60
            parts.append(f"{mins:.0f} min")
        if pace is not None:
            p_mins, p_secs = divmod(int(pace), 60)
            parts.append(f"pace {p_mins}:{p_secs:02d}/km")
        lines.append(", ".join(parts) if len(parts) > 1 else parts[0])
    return "\n".join(lines)


async def build_cardio_history_prompt(username: str, db: AsyncSession) -> str:
    """Assemble 4 weeks of cardio-only history for prompt context."""
    from sqlalchemy.orm import selectinload

    today = datetime.date.today()
    cutoff = today - datetime.timedelta(weeks=4)
    cutoff_dt = datetime.datetime.combine(cutoff, datetime.time.min, tzinfo=datetime.timezone.utc)

    result = await db.execute(
        select(WorkoutSession)
        .where(
            WorkoutSession.user_id == username,
            WorkoutSession.type == "cardio",
            WorkoutSession.date >= cutoff_dt,
        )
        .order_by(WorkoutSession.date.asc())
        .options(selectinload(WorkoutSession.cardio_session).selectinload(CardioSession.segments))
    )
    sessions = result.scalars().all()

    if not sessions:
        return "No cardio sessions recorded in the past 4 weeks."

    lines: list[str] = ["Recent cardio history (last 4 weeks):"]
    for ws in sessions:
        lines.append(compact_session_summary(ws))
    return "\n".join(lines)


async def get_skip_notes_context(username: str, db: AsyncSession) -> str:
    """Return formatted skip notes from the current and previous week, or empty string."""
    from app.models.plan import PlannedSession, WeeklyPlan

    today = datetime.date.today()
    current_week_start = today - datetime.timedelta(days=today.weekday())
    prev_week_start = current_week_start - datetime.timedelta(weeks=1)

    result = await db.execute(
        select(PlannedSession)
        .join(WeeklyPlan, WeeklyPlan.id == PlannedSession.plan_id)
        .where(
            WeeklyPlan.user_id == username,
            WeeklyPlan.week_start.in_([current_week_start, prev_week_start]),
            PlannedSession.skip_note.isnot(None),
            PlannedSession.skip_note != "",
        )
        .order_by(PlannedSession.planned_date)
    )
    sessions = result.scalars().all()

    if not sessions:
        return ""

    lines: list[str] = ["Skip notes (recent weeks):"]
    for s in sessions:
        lines.append(
            f"  Skipped {s.title or s.session_type} on {s.planned_date}: {s.skip_note}"
        )
    return "\n".join(lines)


def compact_session_summary(ws: WorkoutSession) -> str:
    """Build a compact plain-text summary of one session for use in AI prompts."""
    date_str = ws.date.strftime("%Y-%m-%d")
    session_type = ws.type

    lines: list[str] = [f"Session: {date_str} ({session_type})"]
    if ws.title:
        lines[0] += f" — {ws.title}"

    if ws.wellbeing is not None or ws.rpe is not None:
        wb_parts = []
        if ws.wellbeing is not None:
            wb_parts.append(f"wellbeing={ws.wellbeing}/5")
        if ws.rpe is not None:
            wb_parts.append(f"RPE={ws.rpe}/10")
        lines.append("  " + ", ".join(wb_parts))

    if session_type == "strength" and ws.strength_session:
        ss = ws.strength_session
        for entry in ss.exercise_entries:
            sets_str = compact_sets(entry.sets)
            lines.append(f"  {entry.exercise.name}: {sets_str}")

    elif session_type == "cardio" and ws.cardio_session:
        cs = ws.cardio_session
        segs_str = compact_cardio_segments(cs.segments)
        if cs.total_duration_seconds:
            mins = cs.total_duration_seconds // 60
            lines.append(f"  Duration: {mins} min")
        if segs_str:
            lines.append(f"  Segments: {segs_str}")

    if ws.notes:
        lines.append(f"  Notes: {ws.notes}")

    return "\n".join(lines)


# ── Weekly history prompt ─────────────────────────────────────────────────────

async def build_weekly_history_prompt(username: str, db: AsyncSession) -> str:
    """Assemble current week + previous 5 weeks into structured text."""
    from sqlalchemy.orm import selectinload

    today = datetime.date.today()
    # Start of current ISO week (Monday)
    start_of_current_week = today - datetime.timedelta(days=today.weekday())
    # We want current week + 5 prior = 6 weeks total
    cutoff = start_of_current_week - datetime.timedelta(weeks=5)
    cutoff_dt = datetime.datetime.combine(cutoff, datetime.time.min, tzinfo=datetime.timezone.utc)

    result = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == username)
        .where(WorkoutSession.date >= cutoff_dt)
        .order_by(WorkoutSession.date.asc())
        .options(
            selectinload(WorkoutSession.strength_session).selectinload(
                StrengthSession.exercise_entries
            ).selectinload(StrengthExerciseEntry.sets),
            selectinload(WorkoutSession.strength_session).selectinload(
                StrengthSession.exercise_entries
            ).selectinload(StrengthExerciseEntry.exercise),
            selectinload(WorkoutSession.cardio_session).selectinload(CardioSession.segments),
        )
    )
    sessions = result.scalars().all()

    if not sessions:
        return "No training sessions recorded in the past 6 weeks."

    # Group by ISO week
    from collections import defaultdict

    weeks: dict[tuple[int, int], list[WorkoutSession]] = defaultdict(list)
    for ws in sessions:
        iso = ws.date.isocalendar()
        weeks[(iso.year, iso.week)].append(ws)

    lines: list[str] = []
    for (year, week), week_sessions in sorted(weeks.items()):
        lines.append(f"\nWeek {year}-W{week:02d}:")
        for ws in week_sessions:
            lines.append(compact_session_summary(ws))

    return "\n".join(lines)


# ── AI call dispatcher ────────────────────────────────────────────────────────

async def _write_log(
    db: AsyncSession,
    *,
    username: str,
    endpoint: str,
    provider: str,
    model: str,
    prompt: str,
    response: str | None,
    input_tokens: int | None,
    output_tokens: int | None,
    duration_ms: int,
    error: str | None,
) -> None:
    """Write a row to ai_request_logs; silently swallow any DB errors."""
    try:
        log_row = AiRequestLog(
            username=username,
            endpoint=endpoint,
            provider=provider,
            model=model,
            prompt=prompt,
            response=response,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            duration_ms=duration_ms,
            error=error,
        )
        db.add(log_row)
        await db.commit()
    except Exception:
        pass


async def call_ai(
    prompt: str,
    username: str,
    endpoint: str,
    db: AsyncSession,
) -> str:
    """Prepend athlete context, dispatch to AI, log, and return response text."""
    # Fetch user settings for context block
    result = await db.execute(select(UserSettings).where(UserSettings.username == username))
    row = result.scalar_one_or_none()
    context_block = build_athlete_context_block(row)

    full_prompt = (context_block + "\n\n" + prompt).strip() if context_block else prompt

    provider_info = await get_active_provider(username, db)
    if provider_info is None:
        raise ValueError("no_api_key")

    provider, api_key = provider_info
    model = ANTHROPIC_MODEL if provider == "anthropic" else OPENAI_MODEL

    start = time.monotonic()
    response_text: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    error_msg: str | None = None

    try:
        if provider == "anthropic":
            import anthropic

            client = anthropic.Anthropic(api_key=api_key)
            message = client.messages.create(
                model=model,
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": full_prompt,
                                "cache_control": {"type": "ephemeral"},
                            }
                        ],
                    }
                ],
            )
            response_text = message.content[0].text
            input_tokens = message.usage.input_tokens
            output_tokens = message.usage.output_tokens

        else:
            from openai import OpenAI

            client = OpenAI(api_key=api_key)
            completion = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": full_prompt}],
                max_tokens=1024,
            )
            response_text = completion.choices[0].message.content or ""
            if completion.usage:
                input_tokens = completion.usage.prompt_tokens
                output_tokens = completion.usage.completion_tokens

    except Exception as exc:
        error_msg = str(exc)

    finally:
        duration_ms = int((time.monotonic() - start) * 1000)
        await _write_log(
            db,
            username=username,
            endpoint=endpoint,
            provider=provider,
            model=model,
            prompt=full_prompt,
            response=response_text,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            duration_ms=duration_ms,
            error=error_msg,
        )

    if error_msg is not None:
        raise RuntimeError(error_msg)

    return response_text  # type: ignore[return-value]


# ── Weekly insights ───────────────────────────────────────────────────────────

async def call_weekly_insights(username: str, db: AsyncSession) -> str:
    history = await build_weekly_history_prompt(username, db)
    skip_notes = await get_skip_notes_context(username, db)
    history_block = f"{history}\n\n{skip_notes}" if skip_notes else history
    prompt = (
        "You are a personal training coach. Analyse the athlete's recent training log below.\n"
        "Surface: total volume change week-over-week, pace or strength progression, any PRs, "
        "wellbeing/RPE patterns, and any imbalance observations (e.g. all push, no pull). "
        "Keep the response concise — 150–250 words.\n\n"
        f"Training history:\n{history_block}"
    )
    return await call_ai(prompt, username, "weekly-insights", db)


# ── Adapt session ─────────────────────────────────────────────────────────────

async def build_session_snapshot_prompt(
    session_snapshot: dict,
    user_message: str,
    username: str,
    db: AsyncSession,
) -> str:
    """Build the adapt-session prompt including recent history and replacement options."""
    from sqlalchemy.orm import selectinload

    # Fetch last 4 weeks of training for context
    today = datetime.date.today()
    cutoff = today - datetime.timedelta(weeks=4)
    cutoff_dt = datetime.datetime.combine(cutoff, datetime.time.min, tzinfo=datetime.timezone.utc)

    result = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == username)
        .where(WorkoutSession.date >= cutoff_dt)
        .order_by(WorkoutSession.date.asc())
        .options(
            selectinload(WorkoutSession.strength_session).selectinload(
                StrengthSession.exercise_entries
            ).selectinload(StrengthExerciseEntry.sets),
            selectinload(WorkoutSession.strength_session).selectinload(
                StrengthSession.exercise_entries
            ).selectinload(StrengthExerciseEntry.exercise),
            selectinload(WorkoutSession.cardio_session).selectinload(CardioSession.segments),
        )
    )
    recent_sessions = result.scalars().all()

    history_lines: list[str] = ["Recent training history (last 4 weeks):"]
    for ws in recent_sessions:
        history_lines.append(compact_session_summary(ws))
    history_text = "\n".join(history_lines) if recent_sessions else "No recent training data."

    # Format snapshot
    template_name = session_snapshot.get("template_name", "")
    exercises = session_snapshot.get("exercises", [])

    snap_lines: list[str] = ["Planned session:"]
    if template_name:
        snap_lines[0] += f" {template_name}"

    for ex in exercises:
        ex_name = ex.get("exercise_name", "Unknown")
        sets = ex.get("sets", [])
        sets_str = compact_sets(sets)
        replacements = ex.get("replacements", [])
        repl_str = ", ".join(r.get("name", "") for r in replacements) if replacements else "none"
        snap_lines.append(f"  {ex_name}: {sets_str}")
        snap_lines.append(f"    Available replacements: {repl_str}")

    snapshot_text = "\n".join(snap_lines)

    prompt = (
        "You are a personal training coach. The athlete wants to adapt today's planned session.\n\n"
        f"{history_text}\n\n"
        f"{snapshot_text}\n\n"
        f"Athlete's message: {user_message}\n\n"
        "Provide specific, actionable modification suggestions. "
        "Reference available replacements when recommending swaps. "
        "Keep the response concise and practical."
    )
    return prompt


async def call_adapt_session(
    session_snapshot: dict,
    user_message: str,
    username: str,
    db: AsyncSession,
) -> str:
    prompt = await build_session_snapshot_prompt(session_snapshot, user_message, username, db)
    return await call_ai(prompt, username, "adapt-session", db)


# ── Adapt cardio session ──────────────────────────────────────────────────────

async def call_adapt_cardio_session(
    planned_session_id: int,
    complaint: str,
    username: str,
    db: AsyncSession,
) -> str:
    """Build and dispatch the adapt-cardio-session prompt.

    Raises ValueError("not_found") if the planned session does not exist or
    belongs to a different user.
    """
    from sqlalchemy.orm import selectinload

    from app.models.cardio_activity_type import CardioActivityType
    from app.models.plan import PlannedSession, WeeklyPlan

    result = await db.execute(
        select(PlannedSession)
        .join(WeeklyPlan, WeeklyPlan.id == PlannedSession.plan_id)
        .where(
            PlannedSession.id == planned_session_id,
            WeeklyPlan.user_id == username,
        )
        .options(selectinload(PlannedSession.cardio_segments))
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise ValueError("not_found")

    # Resolve activity type names
    activity_type_ids = [seg.activity_type_id for seg in session.cardio_segments]
    act_names: dict[int, str] = {}
    if activity_type_ids:
        at_result = await db.execute(
            select(CardioActivityType).where(CardioActivityType.id.in_(activity_type_ids))
        )
        for at in at_result.scalars().all():
            act_names[at.id] = at.name

    segments_data = [
        {
            "activity_type_name": act_names.get(seg.activity_type_id, "Unknown"),
            "title": seg.title,
            "distance_metres": seg.distance_metres,
            "duration_secs": seg.duration_secs,
            "pace_secs_per_km": seg.pace_secs_per_km,
            "notes": seg.notes,
        }
        for seg in session.cardio_segments
    ]

    planned_text = format_planned_cardio_session(session.title, segments_data)
    cardio_history = await build_cardio_history_prompt(username, db)

    prompt = (
        "You are a personal training coach. The athlete wants to adapt today's planned cardio session.\n\n"
        f"{cardio_history}\n\n"
        f"{planned_text}\n\n"
        f"Athlete's message: {complaint}\n\n"
        "Provide specific, actionable modification suggestions for the planned cardio session. "
        "Reference the planned distances, durations, and paces when suggesting adjustments. "
        "Keep the response concise and practical."
    )
    return await call_ai(prompt, username, "adapt-cardio-session", db)
