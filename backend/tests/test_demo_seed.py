from datetime import date, timedelta

import bcrypt
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.config import settings
from app.demo import DEMO_PASSWORD, DEMO_USERNAME
from app.demo.seed import DemoSeedDisabledError, main, seed_demo
from app.models import (
    CardioActivityType,
    DailySteps,
    Exercise,
    PlannedSession,
    StrengthExerciseEntry,
    StrengthSession,
    StrengthSet,
    StrengthTemplate,
    UserSettings,
    WeeklyPlan,
    WorkoutSession,
)
from tests.conftest import TEST_USERNAME

# A Wednesday, so the current week has past days, today, and future days.
TODAY = date(2026, 9, 30)
DEMO_LOGIN = {"username": DEMO_USERNAME, "password": DEMO_PASSWORD}


@pytest.fixture
def demo_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "demo_user_enabled", True)


# ── auth ──────────────────────────────────────────────────────────────────────


async def test_demo_login_rejected_when_flag_off(client: AsyncClient) -> None:
    assert settings.demo_user_enabled is False
    resp = await client.post("/api/auth/login", json=DEMO_LOGIN)
    assert resp.status_code == 401


async def test_demo_login_accepted_when_flag_on(client: AsyncClient, demo_enabled: None) -> None:
    resp = await client.post("/api/auth/login", json=DEMO_LOGIN)
    assert resp.status_code == 200
    # refresh must also recognise the demo user
    resp = await client.post("/api/auth/refresh")
    assert resp.status_code == 200


async def test_demo_wrong_password_rejected(client: AsyncClient, demo_enabled: None) -> None:
    resp = await client.post("/api/auth/login", json={**DEMO_LOGIN, "password": "nope"})
    assert resp.status_code == 401


async def test_users_entry_named_demo_takes_precedence(
    client: AsyncClient, demo_enabled: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    hashed = bcrypt.hashpw(b"secret", bcrypt.gensalt(rounds=4)).decode()
    monkeypatch.setattr(settings, "users", f"{settings.users},{DEMO_USERNAME}:{hashed}")
    resp = await client.post("/api/auth/login", json=DEMO_LOGIN)
    assert resp.status_code == 401
    resp = await client.post("/api/auth/login", json={**DEMO_LOGIN, "password": "secret"})
    assert resp.status_code == 200


# ── seeder ────────────────────────────────────────────────────────────────────


async def _count(Session, model, *where) -> int:
    async with Session() as db:
        stmt = select(func.count()).select_from(model).where(*where)
        return (await db.execute(stmt)).scalar_one()


async def _snapshot(Session) -> list[tuple]:
    async with Session() as db:
        rows = await db.execute(
            select(WorkoutSession.date, WorkoutSession.title, WorkoutSession.calories)
            .where(WorkoutSession.user_id == DEMO_USERNAME)
            .order_by(WorkoutSession.date)
        )
        return [tuple(r) for r in rows]


async def test_seed_refuses_when_flag_off(client: AsyncClient, db_session) -> None:
    async with db_session() as db:
        db.add(DailySteps(user_id=DEMO_USERNAME, date=TODAY, steps=1234))
        await db.commit()
    with pytest.raises(DemoSeedDisabledError):
        await seed_demo(client, db_session, today=TODAY)
    # nothing was reset
    assert await _count(db_session, DailySteps, DailySteps.user_id == DEMO_USERNAME) == 1
    assert main([]) == 1


async def test_seed_populates_resets_and_isolates(
    client: AsyncClient, auth_client: AsyncClient, db_session, demo_enabled: None
) -> None:
    # Another user's data that must survive both runs
    run = await auth_client.post("/api/cardio-types", json={"name": "Running"})
    assert run.status_code == 201
    run_id = run.json()["id"]
    resp = await auth_client.post("/api/steps", json={"date": TODAY.isoformat(), "steps": 4321})
    assert resp.status_code == 201
    resp = await auth_client.post(
        f"/api/plans/{TODAY - timedelta(days=TODAY.weekday())}/sessions",
        json={"planned_date": TODAY.isoformat(), "session_type": "cardio",
              "activity_type_id": run_id, "title": "Mine",
              "segments": [{"segment_order": 1, "duration_secs": 1800}]},
    )
    assert resp.status_code == 201, resp.text
    resp = await auth_client.post("/api/sessions/cardio", json={
        "activity_type_id": run_id, "total_duration_seconds": 1800,
        "date": f"{TODAY.isoformat()}T07:00:00Z", "segments": [],
    })
    assert resp.status_code == 201, resp.text
    other = WorkoutSession.user_id == TEST_USERNAME

    first = await seed_demo(client, db_session, today=TODAY)
    snap_first = await _snapshot(db_session)

    demo = DEMO_USERNAME
    assert first["templates"] == 3 and first["exercises"] == 18 and first["cardio_types"] == 3
    assert first["strength_sessions"] > 20 and first["cardio_sessions"] > 15
    assert first["step_days"] > 60 and first["skipped_with_note"] >= 2
    assert await _count(db_session, WorkoutSession, WorkoutSession.user_id == demo) == (
        first["strength_sessions"] + first["cardio_sessions"]
    )
    assert await _count(db_session, WeeklyPlan, WeeklyPlan.user_id == demo) == 13  # 12 + next
    assert await _count(db_session, DailySteps, DailySteps.user_id == demo) == first["step_days"]
    assert await _count(db_session, StrengthTemplate, StrengthTemplate.user_id == demo) == 3
    assert await _count(db_session, UserSettings, UserSettings.username == demo) == 1

    # Today has an undone cardio + strength plan; this week has a skip with a note
    async with db_session() as db:
        planned = (await db.execute(
            select(PlannedSession).join(WeeklyPlan).where(WeeklyPlan.user_id == demo)
        )).scalars().all()
        logged_days = {d.date() for d in (await db.execute(
            select(WorkoutSession.date).where(WorkoutSession.user_id == demo)
        )).scalars()}
    today_types = {p.session_type for p in planned if p.planned_date == TODAY}
    assert today_types == {"cardio", "strength"}
    assert TODAY not in logged_days and max(logged_days) < TODAY
    monday = TODAY - timedelta(days=TODAY.weekday())
    assert any(p.skip_note and monday <= p.planned_date < TODAY for p in planned)

    # Per-set RPE lives in its own column, not in set notes
    async with db_session() as db:
        demo_sets = (await db.execute(
            select(StrengthSet.rpe, StrengthSet.notes)
            .join(StrengthExerciseEntry, StrengthExerciseEntry.id == StrengthSet.exercise_entry_id)
            .join(StrengthSession, StrengthSession.id == StrengthExerciseEntry.strength_session_id)
            .join(WorkoutSession, WorkoutSession.id == StrengthSession.session_id)
            .where(WorkoutSession.user_id == demo)
        )).all()
    rpes = [r for r, _ in demo_sets if r is not None]
    assert 0.2 * len(demo_sets) < len(rpes) < 0.5 * len(demo_sets)
    assert set(rpes) <= {6, 7, 8, 9}
    assert not any(n and "RPE" in n for _, n in demo_sets)

    second = await seed_demo(client, db_session, today=TODAY)
    assert second == first
    assert await _snapshot(db_session) == snap_first  # deterministic values
    assert await _count(db_session, WorkoutSession, WorkoutSession.user_id == demo) == (
        second["strength_sessions"] + second["cardio_sessions"]
    )
    assert await _count(db_session, WeeklyPlan, WeeklyPlan.user_id == demo) == 13
    assert await _count(db_session, Exercise, Exercise.user_id == demo) == 18

    # Other user's rows untouched
    assert await _count(db_session, CardioActivityType,
                        CardioActivityType.user_id == TEST_USERNAME) == 1
    assert await _count(db_session, DailySteps, DailySteps.user_id == TEST_USERNAME) == 1
    assert await _count(db_session, WeeklyPlan, WeeklyPlan.user_id == TEST_USERNAME) == 1
    assert await _count(db_session, WorkoutSession, other) == 1


async def test_seed_on_monday_still_has_today_plans(
    client: AsyncClient, db_session, demo_enabled: None
) -> None:
    monday = date(2026, 9, 28)
    counts = await seed_demo(client, db_session, today=monday, weeks=2)
    async with db_session() as db:
        today_types = {p.session_type for p in (await db.execute(
            select(PlannedSession).where(PlannedSession.planned_date == monday)
        )).scalars()}
    assert today_types == {"cardio", "strength"}
    assert counts["skipped_with_note"] >= 1  # previous week's forced skip
