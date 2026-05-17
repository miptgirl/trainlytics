import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.template import (
    StrengthTemplate,
    StrengthTemplateHistory,
    StrengthTemplateHistoryExercise,
    StrengthTemplateHistorySet,
)


async def _create_exercise(client: AsyncClient, name: str = "Squat") -> int:
    resp = await client.post("/api/exercises", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


def _template_payload(ex_id: int, name: str = "Push Day") -> dict:
    return {
        "name": name,
        "notes": "My template",
        "exercises": [
            {
                "exercise_id": ex_id,
                "order": 1,
                "sets": [
                    {"set_number": 1, "reps": 5, "weight_kg": 100.0},
                    {"set_number": 2, "reps": 5, "weight_kg": 105.0},
                ],
            }
        ],
    }


# ── create ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_strength_template(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    resp = await auth_client.post("/api/templates/strength", json=_template_payload(ex_id))
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Push Day"
    assert data["notes"] == "My template"
    assert len(data["exercises"]) == 1
    assert data["exercises"][0]["exercise_name"] == "Squat"
    assert len(data["exercises"][0]["sets"]) == 2
    assert data["exercises"][0]["sets"][0]["weight_kg"] == 100.0
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


@pytest.mark.asyncio
async def test_create_template_multiple_exercises(db_session, auth_client: AsyncClient):
    ex1_id = await _create_exercise(auth_client, "Bench Press")
    ex2_id = await _create_exercise(auth_client, "Deadlift")
    payload = {
        "name": "Full Body",
        "notes": None,
        "exercises": [
            {
                "exercise_id": ex1_id,
                "order": 1,
                "sets": [{"set_number": 1, "reps": 8, "weight_kg": 60.0}],
            },
            {
                "exercise_id": ex2_id,
                "order": 2,
                "sets": [
                    {"set_number": 1, "reps": 3, "weight_kg": 120.0},
                    {"set_number": 2, "reps": 3, "weight_kg": 120.0},
                ],
            },
        ],
    }
    resp = await auth_client.post("/api/templates/strength", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["exercises"]) == 2
    assert data["exercises"][1]["exercise_name"] == "Deadlift"
    assert len(data["exercises"][1]["sets"]) == 2


@pytest.mark.asyncio
async def test_create_template_unknown_exercise_rejected(db_session, auth_client: AsyncClient):
    payload = {
        "name": "Bad Template",
        "exercises": [
            {"exercise_id": 9999, "order": 1, "sets": [{"set_number": 1, "reps": 5}]}
        ],
    }
    resp = await auth_client.post("/api/templates/strength", json=payload)
    assert resp.status_code == 400


# ── list ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_templates_empty(db_session, auth_client: AsyncClient):
    resp = await auth_client.get("/api/templates/strength")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_templates_shows_exercise_count(db_session, auth_client: AsyncClient):
    ex1_id = await _create_exercise(auth_client, "Bench Press")
    ex2_id = await _create_exercise(auth_client, "Squat")

    # Template with 1 exercise
    await auth_client.post("/api/templates/strength", json=_template_payload(ex1_id, "A"))
    # Template with 2 exercises
    payload = {
        "name": "B",
        "exercises": [
            {"exercise_id": ex1_id, "order": 1, "sets": [{"set_number": 1, "reps": 5}]},
            {"exercise_id": ex2_id, "order": 2, "sets": [{"set_number": 1, "reps": 5}]},
        ],
    }
    await auth_client.post("/api/templates/strength", json=payload)

    resp = await auth_client.get("/api/templates/strength")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 2
    a = next(t for t in items if t["name"] == "A")
    b = next(t for t in items if t["name"] == "B")
    assert a["exercise_count"] == 1
    assert b["exercise_count"] == 2


# ── get detail ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_strength_template(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    create = await auth_client.post("/api/templates/strength", json=_template_payload(ex_id))
    tmpl_id = create.json()["id"]

    resp = await auth_client.get(f"/api/templates/strength/{tmpl_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == tmpl_id
    assert data["name"] == "Push Day"
    assert len(data["exercises"]) == 1
    assert data["exercises"][0]["exercise_name"] == "Squat"
    assert len(data["exercises"][0]["sets"]) == 2


@pytest.mark.asyncio
async def test_get_template_not_found(db_session, auth_client: AsyncClient):
    resp = await auth_client.get("/api/templates/strength/9999")
    assert resp.status_code == 404


# ── patch ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_patch_strength_template(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    create = await auth_client.post("/api/templates/strength", json=_template_payload(ex_id))
    tmpl_id = create.json()["id"]
    original_updated_at = create.json()["updated_at"]

    patch_resp = await auth_client.patch(
        f"/api/templates/strength/{tmpl_id}",
        json={
            "name": "Updated Push Day",
            "exercises": [
                {
                    "exercise_id": ex_id,
                    "order": 1,
                    "sets": [
                        {"set_number": 1, "reps": 3, "weight_kg": 120.0},
                    ],
                }
            ],
        },
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["name"] == "Updated Push Day"
    assert len(data["exercises"][0]["sets"]) == 1
    assert data["exercises"][0]["sets"][0]["reps"] == 3
    assert data["exercises"][0]["sets"][0]["weight_kg"] == 120.0
    assert data["updated_at"] >= original_updated_at


@pytest.mark.asyncio
async def test_patch_template_name_only(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    create = await auth_client.post("/api/templates/strength", json=_template_payload(ex_id))
    tmpl_id = create.json()["id"]

    resp = await auth_client.patch(
        f"/api/templates/strength/{tmpl_id}", json={"name": "Renamed"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Renamed"
    assert len(data["exercises"]) == 1  # exercises unchanged


# ── delete ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_strength_template(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    create = await auth_client.post("/api/templates/strength", json=_template_payload(ex_id))
    tmpl_id = create.json()["id"]

    del_resp = await auth_client.delete(f"/api/templates/strength/{tmpl_id}")
    assert del_resp.status_code == 204

    get_resp = await auth_client.get(f"/api/templates/strength/{tmpl_id}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_template_exercise_library_unaffected(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client, "Bench Press")
    create = await auth_client.post("/api/templates/strength", json=_template_payload(ex_id))
    tmpl_id = create.json()["id"]

    await auth_client.delete(f"/api/templates/strength/{tmpl_id}")

    # Exercise still accessible in the library
    exercises = await auth_client.get("/api/exercises")
    assert exercises.status_code == 200
    ids = [e["id"] for e in exercises.json()]
    assert ex_id in ids


# ── user isolation ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_template_user_isolation(
    db_session, auth_client: AsyncClient, auth_client_2: AsyncClient
):
    ex_id = await _create_exercise(auth_client)
    create = await auth_client.post("/api/templates/strength", json=_template_payload(ex_id))
    tmpl_id = create.json()["id"]

    # User 2 cannot read user 1's template
    resp = await auth_client_2.get(f"/api/templates/strength/{tmpl_id}")
    assert resp.status_code == 404

    # User 2 cannot patch user 1's template
    resp = await auth_client_2.patch(
        f"/api/templates/strength/{tmpl_id}", json={"name": "Stolen"}
    )
    assert resp.status_code == 404

    # User 2 cannot delete user 1's template
    resp = await auth_client_2.delete(f"/api/templates/strength/{tmpl_id}")
    assert resp.status_code == 404

    # User 2's list is empty
    resp = await auth_client_2.get("/api/templates/strength")
    assert resp.status_code == 200
    assert resp.json() == []


# ── cascade delete ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_template_cascade_delete(db_session, auth_client: AsyncClient):
    """Deleting a template removes its exercises and sets (handled by DB cascade)."""
    ex_id = await _create_exercise(auth_client)
    create = await auth_client.post(
        "/api/templates/strength",
        json={
            "name": "Cascade Test",
            "exercises": [
                {
                    "exercise_id": ex_id,
                    "order": 1,
                    "sets": [
                        {"set_number": 1, "reps": 5, "weight_kg": 80.0},
                        {"set_number": 2, "reps": 5, "weight_kg": 80.0},
                    ],
                }
            ],
        },
    )
    tmpl_id = create.json()["id"]

    del_resp = await auth_client.delete(f"/api/templates/strength/{tmpl_id}")
    assert del_resp.status_code == 204

    # Template gone
    assert (await auth_client.get(f"/api/templates/strength/{tmpl_id}")).status_code == 404

    # Exercise still in library
    exercises = await auth_client.get("/api/exercises")
    assert any(e["id"] == ex_id for e in exercises.json())


# ── Phase 14: template versioning ────────────────────────────────────────────

async def test_create_template_writes_version_1_history(db_session, auth_client: AsyncClient):
    ex1_id = await _create_exercise(auth_client, "Squat")
    ex2_id = await _create_exercise(auth_client, "Bench Press")

    payload = {
        "name": "Version Test",
        "exercises": [
            {"exercise_id": ex1_id, "order": 1, "sets": [{"set_number": 1, "reps": 5, "weight_kg": 100.0}]},
            {"exercise_id": ex2_id, "order": 2, "sets": [{"set_number": 1, "reps": 8, "weight_kg": 60.0}]},
        ],
    }
    resp = await auth_client.post("/api/templates/strength", json=payload)
    assert resp.status_code == 201
    tmpl_id = resp.json()["id"]

    async with db_session() as session:
        result = await session.execute(
            select(StrengthTemplateHistory).where(StrengthTemplateHistory.template_id == tmpl_id)
        )
        history_rows = result.scalars().all()
        assert len(history_rows) == 1
        assert history_rows[0].version == 1

        result = await session.execute(
            select(StrengthTemplateHistoryExercise)
            .where(StrengthTemplateHistoryExercise.history_id == history_rows[0].id)
        )
        assert len(result.scalars().all()) == 2

        tmpl = await session.get(StrengthTemplate, tmpl_id)
        assert tmpl.current_version == 1


async def test_update_template_increments_version(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    create = await auth_client.post("/api/templates/strength", json=_template_payload(ex_id))
    tmpl_id = create.json()["id"]

    await auth_client.patch(
        f"/api/templates/strength/{tmpl_id}",
        json={"exercises": [
            {"exercise_id": ex_id, "order": 1, "sets": [{"set_number": 1, "reps": 3, "weight_kg": 120.0}]}
        ]},
    )

    async with db_session() as session:
        result = await session.execute(
            select(StrengthTemplateHistory)
            .where(StrengthTemplateHistory.template_id == tmpl_id)
            .order_by(StrengthTemplateHistory.version)
        )
        rows = result.scalars().all()
        assert len(rows) == 2
        assert rows[0].version == 1
        assert rows[1].version == 2

        tmpl = await session.get(StrengthTemplate, tmpl_id)
        assert tmpl.current_version == 2


async def test_update_template_version_1_history_unchanged(db_session, auth_client: AsyncClient):
    ex_id = await _create_exercise(auth_client)
    # _template_payload creates 2 sets: reps=5 weight=100 and reps=5 weight=105
    create = await auth_client.post("/api/templates/strength", json=_template_payload(ex_id))
    tmpl_id = create.json()["id"]

    await auth_client.patch(
        f"/api/templates/strength/{tmpl_id}",
        json={"exercises": [
            {"exercise_id": ex_id, "order": 1, "sets": [{"set_number": 1, "reps": 1, "weight_kg": 200.0}]}
        ]},
    )

    async with db_session() as session:
        result = await session.execute(
            select(StrengthTemplateHistory)
            .where(StrengthTemplateHistory.template_id == tmpl_id, StrengthTemplateHistory.version == 1)
        )
        v1 = result.scalar_one()

        result = await session.execute(
            select(StrengthTemplateHistoryExercise)
            .where(StrengthTemplateHistoryExercise.history_id == v1.id)
        )
        v1_exercises = result.scalars().all()
        assert len(v1_exercises) == 1

        result = await session.execute(
            select(StrengthTemplateHistorySet)
            .where(StrengthTemplateHistorySet.history_exercise_id == v1_exercises[0].id)
        )
        v1_sets = result.scalars().all()
        weights = {s.weight_kg for s in v1_sets}
        assert weights == {100.0, 105.0}  # original weights unchanged
