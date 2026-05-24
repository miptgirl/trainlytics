"""Tests for the import review queue backend (task group 5)."""
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cardio_activity_type import CardioActivityType
from app.models.pending_import import ImportSource, ImportStatus, PendingImport
from app.models.session import CardioSession, StrengthSession, WorkoutSession

# ── helpers ───────────────────────────────────────────────────────────────────

def _cardio_mapped(
    *,
    date: str = "2026-01-10",
    duration: int = 3600,
    activity_type: str | None = "Run",
    distance_m: float | None = 10000.0,
    title: str | None = "Morning Run",
) -> dict:
    pace = (duration / (distance_m / 1000)) if distance_m else None
    return {
        "type": "cardio",
        "source": "strava",
        "activity_type": activity_type,
        "date": date,
        "duration_seconds": duration,
        "distance_m": distance_m,
        "calories": 500,
        "avg_hr_bpm": 155,
        "title": title,
        "segments": [
            {
                "distance_m": distance_m,
                "duration_seconds": duration,
                "pace_s_per_km": pace,
                "activity_type": activity_type,
            }
        ],
    }


def _strength_mapped(
    *,
    date: str = "2026-01-11",
    duration: int = 2700,
    title: str | None = "Leg Day",
) -> dict:
    return {
        "type": "strength",
        "source": "apple_health",
        "activity_type": None,
        "date": date,
        "duration_seconds": duration,
        "distance_m": None,
        "calories": 300,
        "avg_hr_bpm": None,
        "title": title,
        "segments": [],
    }


async def _insert_import(db_session, mapped: dict, status: str = "pending") -> PendingImport:
    async with db_session() as db:
        row = PendingImport(
            source=mapped.get("source", "strava"),
            external_id=f"test_{mapped.get('date')}_{mapped.get('duration_seconds')}",
            raw_data=None,
            mapped_session=mapped,
            status=status,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row


async def _insert_activity_type(db_session, name: str, user: str = "testuser") -> CardioActivityType:
    async with db_session() as db:
        cat = CardioActivityType(user_id=user, name=name)
        db.add(cat)
        await db.commit()
        await db.refresh(cat)
        return cat


async def _insert_cardio_session(
    db_session,
    *,
    date: str = "2026-01-10",
    duration: int = 3600,
    user: str = "testuser",
) -> WorkoutSession:
    async with db_session() as db:
        d = datetime.fromisoformat(f"{date}T00:00:00+00:00")
        ws = WorkoutSession(user_id=user, type="cardio", date=d)
        db.add(ws)
        await db.flush()
        cs = CardioSession(session_id=ws.id, total_duration_seconds=duration)
        db.add(cs)
        await db.commit()
        await db.refresh(ws)
        return ws


# ── list pending ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_pending_returns_only_pending(db_session, auth_client: AsyncClient):
    await _insert_import(db_session, _cardio_mapped(date="2026-01-10"), status="pending")
    await _insert_import(db_session, _cardio_mapped(date="2026-01-11", duration=1800), status="accepted")
    await _insert_import(db_session, _cardio_mapped(date="2026-01-12", duration=900), status="discarded")

    resp = await auth_client.get("/api/imports")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_pending"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["status"] == "pending"


@pytest.mark.asyncio
async def test_list_pending_empty(db_session, auth_client: AsyncClient):
    resp = await auth_client.get("/api/imports")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_pending"] == 0
    assert data["items"] == []


# ── accept ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_accept_creates_cardio_session(db_session, auth_client: AsyncClient):
    await _insert_activity_type(db_session, "Run")
    row = await _insert_import(db_session, _cardio_mapped())

    resp = await auth_client.post(f"/api/imports/{row.id}/accept")
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data
    session_id = data["session_id"]

    async with db_session() as db:
        ws = await db.get(WorkoutSession, session_id)
        assert ws is not None
        assert ws.type == "cardio"
        assert ws.title == "Morning Run"

        import_row = await db.get(PendingImport, row.id)
        assert import_row.status == ImportStatus.accepted.value


@pytest.mark.asyncio
async def test_accept_creates_strength_session(db_session, auth_client: AsyncClient):
    row = await _insert_import(db_session, _strength_mapped())

    resp = await auth_client.post(f"/api/imports/{row.id}/accept")
    assert resp.status_code == 200
    session_id = resp.json()["session_id"]

    async with db_session() as db:
        ws = await db.get(WorkoutSession, session_id)
        assert ws is not None
        assert ws.type == "strength"

        result = await db.execute(
            select(StrengthSession).where(StrengthSession.session_id == session_id)
        )
        ss = result.scalar_one_or_none()
        assert ss is not None
        assert ss.duration_seconds == 2700

        import_row = await db.get(PendingImport, row.id)
        assert import_row.status == ImportStatus.accepted.value


@pytest.mark.asyncio
async def test_accept_cardio_creates_segments(db_session, auth_client: AsyncClient):
    from sqlalchemy.orm import selectinload
    await _insert_activity_type(db_session, "Run")
    row = await _insert_import(db_session, _cardio_mapped(distance_m=10000.0, duration=3600))

    resp = await auth_client.post(f"/api/imports/{row.id}/accept")
    assert resp.status_code == 200
    session_id = resp.json()["session_id"]

    async with db_session() as db:
        result = await db.execute(
            select(CardioSession)
            .where(CardioSession.session_id == session_id)
            .options(selectinload(CardioSession.segments))
        )
        cs = result.scalar_one()
        assert cs.total_duration_seconds == 3600
        assert len(cs.segments) == 1
        assert cs.segments[0].distance_meters == 10000.0


@pytest.mark.asyncio
async def test_accept_already_accepted_returns_400(db_session, auth_client: AsyncClient):
    row = await _insert_import(db_session, _cardio_mapped(), status="accepted")
    resp = await auth_client.post(f"/api/imports/{row.id}/accept")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_accept_not_found_returns_404(db_session, auth_client: AsyncClient):
    resp = await auth_client.post("/api/imports/9999/accept")
    assert resp.status_code == 404


# ── deduplication ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_accept_returns_409_on_duplicate(db_session, auth_client: AsyncClient):
    # Existing session: same date, same duration
    existing = await _insert_cardio_session(db_session, date="2026-01-10", duration=3600)
    row = await _insert_import(db_session, _cardio_mapped(date="2026-01-10", duration=3600))

    resp = await auth_client.post(f"/api/imports/{row.id}/accept")
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert "conflict" in detail
    assert detail["conflict"]["session_id"] == existing.id


@pytest.mark.asyncio
async def test_accept_returns_409_duration_within_60s(db_session, auth_client: AsyncClient):
    # Existing: 3600s; import: 3645s — within 60 s → duplicate
    await _insert_cardio_session(db_session, date="2026-01-10", duration=3600)
    row = await _insert_import(db_session, _cardio_mapped(date="2026-01-10", duration=3645))

    resp = await auth_client.post(f"/api/imports/{row.id}/accept")
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_accept_no_duplicate_when_duration_differs(db_session, auth_client: AsyncClient):
    # Duration differs by more than 60 s → no duplicate
    await _insert_cardio_session(db_session, date="2026-01-10", duration=3600)
    row = await _insert_import(db_session, _cardio_mapped(date="2026-01-10", duration=1800))

    resp = await auth_client.post(f"/api/imports/{row.id}/accept")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_accept_force_bypasses_dedup(db_session, auth_client: AsyncClient):
    await _insert_cardio_session(db_session, date="2026-01-10", duration=3600)
    row = await _insert_import(db_session, _cardio_mapped(date="2026-01-10", duration=3600))

    resp = await auth_client.post(f"/api/imports/{row.id}/accept?force=true")
    assert resp.status_code == 200
    assert "session_id" in resp.json()


# ── discard ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_discard_marks_row_discarded(db_session, auth_client: AsyncClient):
    row = await _insert_import(db_session, _cardio_mapped())

    resp = await auth_client.post(f"/api/imports/{row.id}/discard")
    assert resp.status_code == 200

    async with db_session() as db:
        import_row = await db.get(PendingImport, row.id)
        assert import_row.status == ImportStatus.discarded.value


@pytest.mark.asyncio
async def test_discard_does_not_create_session(db_session, auth_client: AsyncClient):
    row = await _insert_import(db_session, _cardio_mapped())

    await auth_client.post(f"/api/imports/{row.id}/discard")

    async with db_session() as db:
        result = await db.execute(select(WorkoutSession))
        sessions = result.scalars().all()
        assert len(sessions) == 0


@pytest.mark.asyncio
async def test_discard_already_discarded_returns_400(db_session, auth_client: AsyncClient):
    row = await _insert_import(db_session, _cardio_mapped(), status="discarded")
    resp = await auth_client.post(f"/api/imports/{row.id}/discard")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_discard_not_found_returns_404(db_session, auth_client: AsyncClient):
    resp = await auth_client.post("/api/imports/9999/discard")
    assert resp.status_code == 404


# ── patch mapped_session ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_patch_updates_title(db_session, auth_client: AsyncClient):
    row = await _insert_import(db_session, _cardio_mapped(title="Old Title"))

    resp = await auth_client.patch(f"/api/imports/{row.id}", json={"title": "New Title"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["mapped_session"]["title"] == "New Title"


@pytest.mark.asyncio
async def test_patch_updates_date(db_session, auth_client: AsyncClient):
    row = await _insert_import(db_session, _cardio_mapped(date="2026-01-10"))

    resp = await auth_client.patch(f"/api/imports/{row.id}", json={"date": "2026-02-15"})
    assert resp.status_code == 200
    assert resp.json()["mapped_session"]["date"] == "2026-02-15"


@pytest.mark.asyncio
async def test_patch_updates_activity_type(db_session, auth_client: AsyncClient):
    row = await _insert_import(db_session, _cardio_mapped(activity_type="Run"))

    resp = await auth_client.patch(f"/api/imports/{row.id}", json={"activity_type": "Cycle"})
    assert resp.status_code == 200
    assert resp.json()["mapped_session"]["activity_type"] == "Cycle"


@pytest.mark.asyncio
async def test_patch_accepted_import_returns_400(db_session, auth_client: AsyncClient):
    row = await _insert_import(db_session, _cardio_mapped(), status="accepted")
    resp = await auth_client.patch(f"/api/imports/{row.id}", json={"title": "Nope"})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_patch_invalid_date_returns_422(db_session, auth_client: AsyncClient):
    row = await _insert_import(db_session, _cardio_mapped())
    resp = await auth_client.patch(f"/api/imports/{row.id}", json={"date": "not-a-date"})
    assert resp.status_code == 422


# ── accept-all ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_accept_all_accepts_all_pending(db_session, auth_client: AsyncClient):
    await _insert_import(db_session, _cardio_mapped(date="2026-01-10", duration=3600))
    await _insert_import(db_session, _strength_mapped(date="2026-01-11", duration=2700))

    resp = await auth_client.post("/api/imports/accept-all")
    assert resp.status_code == 200
    data = resp.json()
    assert data["accepted"] == 2
    assert data["conflicts"] == []

    # Both should now be accepted
    async with db_session() as db:
        result = await db.execute(
            select(PendingImport).where(PendingImport.status == "pending")
        )
        assert result.scalars().all() == []


@pytest.mark.asyncio
async def test_accept_all_skips_duplicates(db_session, auth_client: AsyncClient):
    existing = await _insert_cardio_session(db_session, date="2026-01-10", duration=3600)
    dup_import = await _insert_import(db_session, _cardio_mapped(date="2026-01-10", duration=3600))
    clean_import = await _insert_import(
        db_session, _cardio_mapped(date="2026-02-01", duration=1800, title="Clean")
    )

    resp = await auth_client.post("/api/imports/accept-all")
    assert resp.status_code == 200
    data = resp.json()
    assert data["accepted"] == 1
    assert len(data["conflicts"]) == 1
    assert data["conflicts"][0]["import_id"] == dup_import.id
    assert data["conflicts"][0]["session_id"] == existing.id

    # Duplicate import remains pending; clean one is accepted
    async with db_session() as db:
        dup_row = await db.get(PendingImport, dup_import.id)
        assert dup_row.status == "pending"
        clean_row = await db.get(PendingImport, clean_import.id)
        assert clean_row.status == "accepted"
