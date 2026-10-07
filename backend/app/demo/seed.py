"""Reset and seed the local-dev demo user with ~12 weeks of realistic data.

    uv run python -m app.demo.seed [--weeks N]

Refuses to run unless DEMO_USER_ENABLED is true. Deletes every row owned by the
demo user, then recreates the data through the app's own API in-process (ASGI
transport), so validation and business logic such as plan matching stay in the loop.

Deterministic: every random value comes from an RNG seeded with SEED plus a stable
key (week index, weekday, ...), so the same `today` always yields identical data.
Dates are anchored to `today`: the last seeded week is the current Mon-Sun week and
plans also cover next week.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sys
from datetime import date, datetime, timedelta
from typing import Any

from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.demo import DEMO_PASSWORD, DEMO_USERNAME
from app.models import (
    AiRequestLog,
    CardioActivityType,
    CardioSegment,
    CardioSession,
    DailySteps,
    Exercise,
    ExerciseType,
    PlannedCardioSegment,
    PlannedSession,
    StrengthExerciseEntry,
    StrengthSession,
    StrengthSet,
    StrengthTemplate,
    StrengthTemplateExercise,
    StrengthTemplateHistory,
    StrengthTemplateHistoryExercise,
    StrengthTemplateHistorySet,
    StrengthTemplateSet,
    UserSettings,
    WeeklyPlan,
    WorkoutSession,
    exercise_exercise_types,
)
from app.models.exercise import exercise_replacements

SEED = 2026
DEFAULT_WEEKS = 12


class DemoSeedDisabledError(RuntimeError):
    pass


# ── reset ─────────────────────────────────────────────────────────────────────


async def reset_demo_data(sessionmaker: async_sessionmaker[AsyncSession]) -> None:
    """Delete every row owned by the demo user, children before parents.

    Explicit deletes instead of relying on ON DELETE CASCADE, so the reset behaves the
    same on Postgres and on SQLite (which ignores FKs unless PRAGMA foreign_keys=ON).
    The user is hardcoded: this function can never touch another user's rows.

    Not touched: body_metrics and pending_imports have no owner column (global tables).
    """
    u = DEMO_USERNAME
    workouts = select(WorkoutSession.id).where(WorkoutSession.user_id == u)
    strength = select(StrengthSession.id).where(StrengthSession.session_id.in_(workouts))
    entries = select(StrengthExerciseEntry.id).where(
        StrengthExerciseEntry.strength_session_id.in_(strength)
    )
    cardio = select(CardioSession.id).where(CardioSession.session_id.in_(workouts))
    plans = select(WeeklyPlan.id).where(WeeklyPlan.user_id == u)
    planned = select(PlannedSession.id).where(PlannedSession.plan_id.in_(plans))
    templates = select(StrengthTemplate.id).where(StrengthTemplate.user_id == u)
    tpl_exercises = select(StrengthTemplateExercise.id).where(
        StrengthTemplateExercise.template_id.in_(templates)
    )
    history = select(StrengthTemplateHistory.id).where(
        StrengthTemplateHistory.template_id.in_(templates)
    )
    history_exercises = select(StrengthTemplateHistoryExercise.id).where(
        StrengthTemplateHistoryExercise.history_id.in_(history)
    )
    exercises = select(Exercise.id).where(Exercise.user_id == u)
    exercise_types = select(ExerciseType.id).where(ExerciseType.user_id == u)

    statements = [
        # plans
        delete(PlannedCardioSegment).where(PlannedCardioSegment.planned_session_id.in_(planned)),
        delete(PlannedSession).where(PlannedSession.plan_id.in_(plans)),
        delete(WeeklyPlan).where(WeeklyPlan.user_id == u),
        # logged sessions
        delete(StrengthSet).where(StrengthSet.exercise_entry_id.in_(entries)),
        delete(StrengthExerciseEntry).where(StrengthExerciseEntry.strength_session_id.in_(strength)),
        delete(StrengthSession).where(StrengthSession.session_id.in_(workouts)),
        delete(CardioSegment).where(CardioSegment.cardio_session_id.in_(cardio)),
        delete(CardioSession).where(CardioSession.session_id.in_(workouts)),
        delete(WorkoutSession).where(WorkoutSession.user_id == u),
        # templates and their version history
        delete(StrengthTemplateHistorySet).where(
            StrengthTemplateHistorySet.history_exercise_id.in_(history_exercises)
        ),
        delete(StrengthTemplateHistoryExercise).where(
            StrengthTemplateHistoryExercise.history_id.in_(history)
        ),
        delete(StrengthTemplateHistory).where(StrengthTemplateHistory.template_id.in_(templates)),
        delete(StrengthTemplateSet).where(StrengthTemplateSet.exercise_entry_id.in_(tpl_exercises)),
        delete(StrengthTemplateExercise).where(StrengthTemplateExercise.template_id.in_(templates)),
        delete(StrengthTemplate).where(StrengthTemplate.user_id == u),
        # exercises and types
        delete(exercise_replacements).where(
            or_(
                exercise_replacements.c.exercise_id.in_(exercises),
                exercise_replacements.c.replacement_id.in_(exercises),
            )
        ),
        delete(exercise_exercise_types).where(
            or_(
                exercise_exercise_types.c.exercise_id.in_(exercises),
                exercise_exercise_types.c.exercise_type_id.in_(exercise_types),
            )
        ),
        delete(Exercise).where(Exercise.user_id == u),
        delete(ExerciseType).where(ExerciseType.user_id == u),
        delete(CardioActivityType).where(CardioActivityType.user_id == u),
        # per-user singletons and logs
        delete(DailySteps).where(DailySteps.user_id == u),
        delete(UserSettings).where(UserSettings.username == u),
        delete(AiRequestLog).where(AiRequestLog.username == u),
    ]
    async with sessionmaker() as db, db.begin():
        for stmt in statements:
            await db.execute(stmt)


# ── data design ───────────────────────────────────────────────────────────────

PROFILE = {
    "display_name": "Demo Athlete",
    "birth_year": 1991,
    "experience_level": "intermediate",
    "goals": [
        {"text": "Run a 10K under 55 minutes", "priority": "high"},
        {"text": "Bench press 70 kg for 5 reps", "priority": "medium"},
        {"text": "Average 9,000 steps a day", "priority": "low"},
    ],
    "injury_notes": (
        "Mild left shoulder impingement; avoid heavy overhead pressing when it flares up."
    ),
    "coach_notes": "Prefers 4 sessions a week. Long run on Saturdays.",
}

CARDIO_TYPES = ["Running", "Walking", "Cycling"]
EXERCISE_TYPES = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Glutes"]

# name: (types, base kg, sets, reps, rounding step)
EXERCISES: dict[str, tuple[list[str], float, int, int, float]] = {
    "Barbell bench press": (["Chest"], 55, 4, 8, 2.5),
    "Barbell row": (["Back"], 50, 4, 8, 2.5),
    "Overhead press": (["Shoulders"], 32.5, 3, 8, 2.5),
    "Lat pulldown": (["Back"], 45, 3, 10, 2.5),
    "Dumbbell biceps curl": (["Arms"], 12, 3, 12, 1),
    "Triceps pushdown": (["Arms"], 25, 3, 12, 2.5),
    "Incline dumbbell press": (["Chest", "Shoulders"], 20, 4, 10, 1),
    "Seated cable row": (["Back"], 45, 4, 10, 2.5),
    "Dumbbell lateral raise": (["Shoulders"], 8, 3, 15, 1),
    "Face pull": (["Shoulders", "Back"], 20, 3, 15, 2.5),
    "Hammer curl": (["Arms"], 12, 3, 12, 1),
    "Overhead triceps extension": (["Arms"], 20, 3, 12, 2.5),
    "Back squat": (["Legs"], 70, 4, 6, 2.5),
    "Romanian deadlift": (["Legs", "Glutes"], 75, 3, 8, 2.5),
    "Leg press": (["Legs"], 140, 3, 10, 5),
    "Walking lunge": (["Legs", "Glutes"], 16, 3, 10, 1),
    "Hip thrust": (["Glutes"], 80, 3, 10, 5),
    "Standing calf raise": (["Legs"], 60, 4, 15, 2.5),
}

TEMPLATES = {
    "Upper body A": ["Barbell bench press", "Barbell row", "Overhead press", "Lat pulldown",
                     "Dumbbell biceps curl", "Triceps pushdown"],
    "Upper body B": ["Incline dumbbell press", "Seated cable row", "Dumbbell lateral raise",
                     "Face pull", "Hammer curl", "Overhead triceps extension"],
    "Lower body": ["Back squat", "Romanian deadlift", "Leg press", "Walking lunge", "Hip thrust",
                   "Standing calf raise"],
}

SET_NOTES = ["Felt heavy", "Last rep slow", "Easy, add weight next time", "Form check ok"]
STRENGTH_NOTES = ["Good session, energy was high.", "Slept badly, kept it controlled.",
                  "Shoulder felt a bit tight on pressing.", "New PR on the first lift!",
                  "Short on time, skipped accessories."]
CARDIO_NOTES = ["Legs felt light today.", "Warm and humid, slower than usual.",
                "Windy on the way back.", "Nice sunny route along the river.",
                "Started too fast, paid for it in the last km."]
SKIP_NOTES = ["Felt run down, took a rest day.", "Travel for work, no gym access.",
              "Sore shoulder, rested.", "Rain all day, skipped.", None]
CARDIO_TITLES = {"easy_run": "Easy run", "intervals": "Interval run", "long_run": "Long run",
                 "walk": "Evening walk"}


def _rng(*key: object) -> random.Random:
    """Independent RNG per item: values don't shift when other items are added/removed."""
    return random.Random(":".join(str(k) for k in (SEED, *key)))


def _is_strength(kind: str) -> bool:
    return kind in TEMPLATES


def _dt(rng: random.Random, d: date, hour: int, minute: int) -> str:
    return datetime(d.year, d.month, d.day, hour, minute, rng.randint(0, 59)).isoformat() + "Z"


def _round(step: float, x: float) -> float:
    return round(x / step) * step


def schedule(w: int, weeks: int) -> list[tuple[int, str]]:
    """Planned sessions for week index w as (weekday, kind). Sunday is a rest day."""
    s = [(0, "Upper body A"), (1, "intervals" if w % 3 == 2 else "easy_run"), (3, "Lower body")]
    if w % 2 == 0 or w >= weeks - 2:
        s.append((4, "Upper body B"))
    s.append((5, "long_run" if w % 2 == 0 else "walk"))
    return s


class _Ids:
    def __init__(self) -> None:
        self.cardio: dict[str, int] = {}
        self.ex_types: dict[str, int] = {}
        self.exercises: dict[str, int] = {}
        self.templates: dict[str, int] = {}


def _strength_payload(ids: _Ids, rng: random.Random, tname: str, d: date, w: int) -> dict:
    entries = []
    for i, name in enumerate(TEMPLATES[tname], 1):
        _, base, nsets, reps, step = EXERCISES[name]
        weight = max(step, _round(step, base * (1 + 0.018 * w) + rng.choice([-1, 0, 0, 1]) * step))
        sets = []
        for s in range(1, nsets + 1):
            r = reps + rng.choice([-1, 0, 0, 1]) - (1 if s == nsets and rng.random() < 0.6 else 0)
            rpe = None
            if rng.random() < 0.33:  # roughly a third of sets carry an RPE; last set runs harder
                rpe = min(9, rng.choice([6, 7, 7, 8]) + (1 if s == nsets else 0))
            sets.append({
                "set_number": s, "reps": r, "weight": weight,
                "notes": rng.choice(SET_NOTES) if rng.random() < 0.15 else None,
                "rpe": rpe,
            })
        entries.append({"exercise_id": ids.exercises[name], "order": i, "sets": sets})
    return {
        "date": _dt(rng, d, rng.choice([6, 7, 17, 18]), rng.randint(0, 50)),
        "notes": rng.choice(STRENGTH_NOTES) if rng.random() < 0.4 else None,
        "title": tname,
        "calories": rng.randint(240, 390),
        "wellbeing": rng.choice([3, 4, 4, 5]),
        "rpe": rng.choice([2, 3, 3, 4, 4, 5]),
        "duration_seconds": rng.randint(2700, 4500),
        "template_id": ids.templates[tname],
        "exercises": entries,
    }


def _zones(rng: random.Random, total: int, easy: bool) -> list[int]:
    p = [0.10, 0.55, 0.28, 0.06, 0.01] if easy else [0.05, 0.30, 0.38, 0.22, 0.05]
    p = [max(0.0, x + rng.uniform(-0.03, 0.03)) for x in p]
    z = [int(total * x / sum(p)) for x in p]
    z[1] += total - sum(z)
    return z


def _cardio_payload(ids: _Ids, rng: random.Random, kind: str, d: date, w: int) -> dict:
    def seg(order: int, dur: int, pace: float, title: str, act: str) -> dict:
        return {"order": order, "duration_seconds": dur, "pace_seconds_per_km": float(pace),
                "distance_meters": round(dur / pace * 1000), "title": title,
                "activity_type_id": ids.cardio[act]}

    base_pace = 372 - w * 2.4  # sec/km, improves over the block
    if kind == "walk":
        dur = rng.randint(2700, 4200)
        segs = [seg(1, dur, rng.randint(600, 665), "Walk", "Walking")]
        act, easy, hr = "Walking", True, rng.randint(104, 118)
    else:
        wu = seg(1, 300, rng.randint(640, 700), "Warm-up walk", "Walking")
        cd = seg(99, 300, rng.randint(650, 710), "Cool-down walk", "Walking")
        if kind == "intervals":
            tempo = base_pace - 28
            segs = [wu]
            for k in range(rng.choice([3, 4])):
                segs.append(seg(len(segs) + 1, 240, tempo + rng.randint(-5, 5), f"Fast {k + 1}",
                                "Running"))
                segs.append(seg(len(segs) + 1, 120, base_pace + 55 + rng.randint(-8, 8),
                                "Recovery jog", "Running"))
            easy, hr = False, rng.randint(158, 169)
        elif kind == "long_run":
            main = int(rng.randint(2700, 3300) + w * 70)
            segs = [wu, seg(2, main, base_pace + 12 + rng.randint(-6, 6), "Long run", "Running")]
            easy, hr = True, rng.randint(146, 156)
        else:
            main = int(rng.randint(1700, 2400) + w * 25)
            segs = [wu, seg(2, main, base_pace + rng.randint(-6, 6), "Easy run", "Running")]
            easy, hr = True, rng.randint(140, 152)
        cd["order"] = len(segs) + 1
        segs.append(cd)
        act = "Running"
    total = sum(s["duration_seconds"] for s in segs)
    z = _zones(rng, total, easy)
    return {
        "activity_type_id": ids.cardio[act],
        "total_duration_seconds": total,
        "date": _dt(rng, d, rng.choice([6, 7, 8, 12, 17, 18]), rng.randint(0, 50)),
        "notes": rng.choice(CARDIO_NOTES) if rng.random() < 0.4 else None,
        "title": CARDIO_TITLES[kind],
        "calories": int(total / 60 * (4.2 if kind == "walk" else 10.6) * rng.uniform(0.93, 1.07)),
        "wellbeing": rng.choice([3, 4, 4, 5]),
        "rpe": rng.choice([1, 2, 2, 3]) if easy else rng.choice([3, 4, 4, 5]),
        "avg_hr_bpm": hr,
        "z1_seconds": z[0], "z2_seconds": z[1], "z3_seconds": z[2],
        "z4_seconds": z[3], "z5_seconds": z[4],
        "segments": segs,
    }


def _plan_segments(kind: str, w: int) -> list[dict]:
    pace = int(372 - w * 2.4)
    if kind == "intervals":
        out = [(300, 670, "Warm-up walk")]
        for k in range(4):
            out += [(240, pace - 28, f"Fast {k + 1}"), (120, pace + 55, "Recovery jog")]
        out.append((300, 680, "Cool-down walk"))
    elif kind == "long_run":
        out = [(300, 670, "Warm-up walk"), (3300, pace + 12, "Long run"),
               (300, 680, "Cool-down walk")]
    elif kind == "walk":
        out = [(3600, 630, "Walk")]
    else:
        out = [(300, 670, "Warm-up walk"), (2100, pace, "Easy run"), (300, 680, "Cool-down walk")]
    return [{"segment_order": i + 1, "title": t, "duration_secs": d, "pace_secs_per_km": p,
             "distance_metres": round(d / p * 1000)} for i, (d, p, t) in enumerate(out)]


def _planned_payload(ids: _Ids, d: date, kind: str, w: int, notes: str | None = None) -> dict:
    if _is_strength(kind):
        return {"planned_date": d.isoformat(), "session_type": "strength",
                "template_id": ids.templates[kind], "notes": notes}
    act = "Walking" if kind == "walk" else "Running"
    return {"planned_date": d.isoformat(), "session_type": "cardio",
            "activity_type_id": ids.cardio[act], "title": CARDIO_TITLES[kind], "notes": notes,
            "segments": _plan_segments(kind, w)}


# ── seeding ───────────────────────────────────────────────────────────────────


class _Api:
    def __init__(self, client: AsyncClient) -> None:
        self.client = client
        self.headers: dict[str, str] = {}

    async def __call__(self, method: str, path: str, body: Any = None) -> Any:
        resp = await self.client.request(method, path, json=body, headers=self.headers)
        if resp.status_code >= 400:
            raise RuntimeError(f"{method} {path} -> {resp.status_code}: {resp.text[:500]}")
        return resp.json() if resp.content else None

    async def login(self) -> None:
        resp = await self.client.post(
            "/api/auth/login", json={"username": DEMO_USERNAME, "password": DEMO_PASSWORD}
        )
        if resp.status_code != 200:
            raise RuntimeError(
                f"demo login failed ({resp.status_code}). If USERS defines '{DEMO_USERNAME}', "
                "that entry takes precedence over the built-in demo login; remove it from USERS."
            )
        self.headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def seed_demo(
    client: AsyncClient,
    sessionmaker: async_sessionmaker[AsyncSession],
    today: date | None = None,
    weeks: int = DEFAULT_WEEKS,
) -> dict[str, int]:
    """Reset the demo user's data and recreate it via `client` (bound to the app).

    Returns counts per created type.
    """
    if not settings.demo_user_enabled:
        raise DemoSeedDisabledError(
            "Demo user is disabled. Set DEMO_USER_ENABLED=true (local dev only) to seed it."
        )
    if weeks < 1:
        raise ValueError("weeks must be >= 1")
    today = today or date.today()
    current_monday = today - timedelta(days=today.weekday())
    start = current_monday - timedelta(weeks=weeks - 1)
    cw = weeks - 1  # index of the current week

    await reset_demo_data(sessionmaker)
    api = _Api(client)
    await api.login()

    counts = dict.fromkeys(
        ["cardio_types", "exercise_types", "exercises", "templates", "strength_sessions",
         "cardio_sessions", "planned_sessions", "skipped_with_note", "step_days"], 0)

    await api("PATCH", "/api/profile", PROFILE)

    ids = _Ids()
    for name in CARDIO_TYPES:
        ids.cardio[name] = (await api("POST", "/api/cardio-types", {"name": name}))["id"]
    for name in EXERCISE_TYPES:
        ids.ex_types[name] = (await api("POST", "/api/exercise-types", {"name": name}))["id"]
    for name, (tags, *_rest) in EXERCISES.items():
        body = {"name": name, "type_ids": [ids.ex_types[t] for t in tags]}
        ids.exercises[name] = (await api("POST", "/api/exercises", body))["id"]
    for tname, names in TEMPLATES.items():
        body = {"name": tname, "notes": None, "exercises": [
            {"exercise_id": ids.exercises[e], "order": i, "sets": [
                {"set_number": s, "reps": EXERCISES[e][3], "weight_kg": EXERCISES[e][1]}
                for s in range(1, EXERCISES[e][2] + 1)
            ]}
            for i, e in enumerate(names, 1)
        ]}
        ids.templates[tname] = (await api("POST", "/api/templates/strength", body))["id"]
    counts.update(cardio_types=len(ids.cardio), exercise_types=len(ids.ex_types),
                  exercises=len(ids.exercises), templates=len(ids.templates))

    # Forced skips so the story is always there: a travel week before this one, and the
    # most recent past session this week (Friday's strength if already past). On a Monday
    # the current week has no past days, so only the previous week's skip exists.
    forced_skip: dict[tuple[int, int], str] = {}
    if weeks >= 2:
        forced_skip[(cw - 1, 3)] = "Travel for work, no gym access."
    past_this_week = [wd for wd, _ in schedule(cw, weeks)
                      if current_monday + timedelta(days=wd) < today]
    if past_this_week:
        wd = 4 if 4 in past_this_week else past_this_week[-1]
        forced_skip[(cw, wd)] = "Sore shoulder, swapped for rest."

    for w in range(weeks):
        ws = start + timedelta(weeks=w)
        for wd, kind in schedule(w, weeks):
            d = ws + timedelta(days=wd)
            rng = _rng("session", w, wd)
            pl = await api("POST", f"/api/plans/{ws}/sessions", _planned_payload(ids, d, kind, w))
            counts["planned_sessions"] += 1
            if d >= today:
                continue  # today and later stay planned
            if (w, wd) in forced_skip:
                note: str | None = forced_skip[(w, wd)]
            elif w == cw or rng.random() >= 0.10:
                note = ""  # done (current week is all done apart from the forced skip)
            else:
                note = rng.choice(SKIP_NOTES)
            if note != "":
                if note:
                    await api("PATCH", f"/api/plans/{ws}/sessions/{pl['id']}/skip-note",
                              {"skip_note": note})
                    counts["skipped_with_note"] += 1
                continue
            if _is_strength(kind):
                await api("POST", "/api/sessions/strength", _strength_payload(ids, rng, kind, d, w))
                counts["strength_sessions"] += 1
            else:
                await api("POST", "/api/sessions/cardio", _cardio_payload(ids, rng, kind, d, w))
                counts["cardio_sessions"] += 1

    # Today always shows one planned cardio and one planned strength session.
    today_kinds = [k for wd, k in schedule(cw, weeks) if wd == today.weekday()]
    order = len(today_kinds)
    if not any(not _is_strength(k) for k in today_kinds):
        body = _planned_payload(ids, today, "easy_run", cw, "Keep it conversational, HR under 150.")
        await api("POST", f"/api/plans/{current_monday}/sessions", {**body, "display_order": order})
        counts["planned_sessions"] += 1
        order += 1
    if not any(_is_strength(k) for k in today_kinds):
        note = "Moved from Friday." if (cw, 4) in forced_skip else None
        body = _planned_payload(ids, today, "Upper body B", cw, note)
        await api("POST", f"/api/plans/{current_monday}/sessions", {**body, "display_order": order})
        counts["planned_sessions"] += 1

    next_monday = current_monday + timedelta(weeks=1)
    for wd, kind in [(0, "Upper body A"), (1, "intervals"), (3, "Lower body"),
                     (4, "Upper body B"), (5, "long_run")]:
        note = "First session of the week, go a bit heavier." if wd == 0 else None
        body = _planned_payload(ids, next_monday + timedelta(days=wd), kind, weeks, note)
        await api("POST", f"/api/plans/{next_monday}/sessions", body)
        counts["planned_sessions"] += 1

    d = start
    while d <= today:
        rng = _rng("steps", (d - start).days)
        if rng.random() > 0.08:  # ~8% of days have no step data
            if d == today:
                val = rng.randint(2800, 4600)  # day isn't over yet
            else:
                base = 10200 if d.weekday() in (1, 5) else 7600
                val = int(max(2500, rng.gauss(base, 2100)))
            await api("POST", "/api/steps", {"date": d.isoformat(), "steps": val})
            counts["step_days"] += 1
        d += timedelta(days=1)

    return counts


# ── CLI ───────────────────────────────────────────────────────────────────────


async def _run(weeks: int) -> dict[str, int]:
    from app.database import AsyncSessionLocal, engine
    from app.main import app

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://seed") as client:
            return await seed_demo(client, AsyncSessionLocal, weeks=weeks)
    finally:
        await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--weeks", type=int, default=DEFAULT_WEEKS,
        help=f"weeks of history ending with the current week (default {DEFAULT_WEEKS})",
    )
    args = parser.parse_args(argv)
    if not settings.demo_user_enabled:
        print("Refusing to seed: DEMO_USER_ENABLED is not true. The demo user is for local "
              "development only.", file=sys.stderr)
        return 1
    try:
        counts = asyncio.run(_run(args.weeks))
    except RuntimeError as exc:  # API/login failures carry a readable message
        print(f"Seeding failed: {exc}", file=sys.stderr)
        return 1
    print(f"Demo user seeded ({args.weeks} weeks ending {date.today():%Y-%m-%d}):")
    for key, value in counts.items():
        print(f"  {key.replace('_', ' '):<18} {value}")
    print(f"Log in as {DEMO_USERNAME} / {DEMO_PASSWORD}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
