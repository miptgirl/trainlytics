import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker

from tests.conftest import TEST_USERNAME


async def test_list_exercises_empty(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.get("/api/exercises")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_exercise(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.post("/api/exercises", json={"name": "Squat", "notes": "Low bar"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Squat"
    assert body["notes"] == "Low bar"
    assert body["user_id"] == TEST_USERNAME
    assert "id" in body
    assert "created_at" in body
    assert body["types"] == []


async def test_create_exercise_no_notes(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.post("/api/exercises", json={"name": "Deadlift"})
    assert resp.status_code == 201
    assert resp.json()["notes"] is None
    assert resp.json()["types"] == []


async def test_create_exercise_with_types(auth_client: AsyncClient, db_session: None) -> None:
    t1 = (await auth_client.post("/api/exercise-types", json={"name": "Push"})).json()
    t2 = (await auth_client.post("/api/exercise-types", json={"name": "Compound"})).json()
    resp = await auth_client.post(
        "/api/exercises", json={"name": "Bench Press", "type_ids": [t1["id"], t2["id"]]}
    )
    assert resp.status_code == 201
    body = resp.json()
    type_names = {t["name"] for t in body["types"]}
    assert type_names == {"Push", "Compound"}


async def test_list_exercises(auth_client: AsyncClient, db_session: None) -> None:
    await auth_client.post("/api/exercises", json={"name": "Deadlift"})
    await auth_client.post("/api/exercises", json={"name": "Bench Press"})
    resp = await auth_client.get("/api/exercises")
    assert resp.status_code == 200
    names = [e["name"] for e in resp.json()]
    assert "Deadlift" in names
    assert "Bench Press" in names


async def test_list_exercises_includes_types(auth_client: AsyncClient, db_session: None) -> None:
    t = (await auth_client.post("/api/exercise-types", json={"name": "Pull"})).json()
    await auth_client.post("/api/exercises", json={"name": "Pull-up", "type_ids": [t["id"]]})
    resp = await auth_client.get("/api/exercises")
    exercise = next(e for e in resp.json() if e["name"] == "Pull-up")
    assert len(exercise["types"]) == 1
    assert exercise["types"][0]["name"] == "Pull"


async def test_update_exercise_name(auth_client: AsyncClient, db_session: None) -> None:
    create = await auth_client.post("/api/exercises", json={"name": "OHP"})
    eid = create.json()["id"]
    resp = await auth_client.patch(f"/api/exercises/{eid}", json={"name": "Overhead Press"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Overhead Press"


async def test_update_exercise_notes(auth_client: AsyncClient, db_session: None) -> None:
    create = await auth_client.post("/api/exercises", json={"name": "Pull-up"})
    eid = create.json()["id"]
    resp = await auth_client.patch(f"/api/exercises/{eid}", json={"notes": "Full range of motion"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Pull-up"  # unchanged
    assert body["notes"] == "Full range of motion"


async def test_patch_null_notes_clears_them(auth_client: AsyncClient, db_session: None) -> None:
    create = await auth_client.post("/api/exercises", json={"name": "Pull-up", "notes": "Full range of motion"})
    eid = create.json()["id"]
    resp = await auth_client.patch(f"/api/exercises/{eid}", json={"notes": None})
    assert resp.status_code == 200
    assert resp.json()["notes"] is None
    listed = await auth_client.get("/api/exercises")
    assert next(e for e in listed.json() if e["id"] == eid)["notes"] is None


async def test_patch_exercise_type_ids(auth_client: AsyncClient, db_session: None) -> None:
    t1 = (await auth_client.post("/api/exercise-types", json={"name": "Push"})).json()
    t2 = (await auth_client.post("/api/exercise-types", json={"name": "Legs"})).json()
    create = await auth_client.post("/api/exercises", json={"name": "Squat", "type_ids": [t1["id"]]})
    eid = create.json()["id"]

    # Replace type associations
    resp = await auth_client.patch(f"/api/exercises/{eid}", json={"type_ids": [t2["id"]]})
    assert resp.status_code == 200
    type_names = {t["name"] for t in resp.json()["types"]}
    assert type_names == {"Legs"}


async def test_patch_exercise_clear_type_ids(auth_client: AsyncClient, db_session: None) -> None:
    t = (await auth_client.post("/api/exercise-types", json={"name": "Push"})).json()
    create = await auth_client.post("/api/exercises", json={"name": "Bench Press", "type_ids": [t["id"]]})
    eid = create.json()["id"]

    resp = await auth_client.patch(f"/api/exercises/{eid}", json={"type_ids": []})
    assert resp.status_code == 200
    assert resp.json()["types"] == []


async def test_create_exercise_invalid_type_id(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.post("/api/exercises", json={"name": "Ghost", "type_ids": [9999]})
    assert resp.status_code == 400


async def test_create_exercise_other_users_type_id(
    auth_client: AsyncClient,
    auth_client_2: AsyncClient,
    db_session: None,
) -> None:
    t = (await auth_client_2.post("/api/exercise-types", json={"name": "Other user type"})).json()
    resp = await auth_client.post("/api/exercises", json={"name": "Bench", "type_ids": [t["id"]]})
    assert resp.status_code == 400


async def test_delete_exercise(auth_client: AsyncClient, db_session: None) -> None:
    create = await auth_client.post("/api/exercises", json={"name": "ToDelete"})
    eid = create.json()["id"]
    del_resp = await auth_client.delete(f"/api/exercises/{eid}")
    assert del_resp.status_code == 204
    list_resp = await auth_client.get("/api/exercises")
    assert all(e["id"] != eid for e in list_resp.json())


async def test_exercise_not_found(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.patch("/api/exercises/9999", json={"name": "Ghost"})
    assert resp.status_code == 404


async def test_exercise_requires_auth(client: AsyncClient, db_session: None) -> None:
    resp = await client.get("/api/exercises")
    assert resp.status_code == 401


async def test_user_isolation(
    auth_client: AsyncClient,
    auth_client_2: AsyncClient,
    db_session: None,
) -> None:
    """User 1's exercises are not visible to user 2."""
    await auth_client.post("/api/exercises", json={"name": "User1 Secret Move"})

    resp = await auth_client_2.get("/api/exercises")
    assert resp.status_code == 200
    assert all(e["name"] != "User1 Secret Move" for e in resp.json())


async def test_user_cannot_edit_other_users_exercise(
    auth_client: AsyncClient,
    auth_client_2: AsyncClient,
    db_session: None,
) -> None:
    create = await auth_client.post("/api/exercises", json={"name": "Mine"})
    eid = create.json()["id"]

    resp = await auth_client_2.patch(f"/api/exercises/{eid}", json={"name": "Stolen"})
    assert resp.status_code == 404


# --- Exercise replacements ---


async def test_list_replacements_empty(auth_client: AsyncClient, db_session: None) -> None:
    ex = (await auth_client.post("/api/exercises", json={"name": "Squat"})).json()
    resp = await auth_client.get(f"/api/exercises/{ex['id']}/replacements")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_add_replacement(auth_client: AsyncClient, db_session: None) -> None:
    squat = (await auth_client.post("/api/exercises", json={"name": "Squat"})).json()
    leg_press = (await auth_client.post("/api/exercises", json={"name": "Leg Press"})).json()

    resp = await auth_client.post(
        f"/api/exercises/{squat['id']}/replacements",
        json={"replacement_id": leg_press["id"]},
    )
    assert resp.status_code == 201
    assert len(resp.json()) == 1
    assert resp.json()[0]["id"] == leg_press["id"]
    assert resp.json()[0]["name"] == "Leg Press"


async def test_list_replacements_after_add(auth_client: AsyncClient, db_session: None) -> None:
    squat = (await auth_client.post("/api/exercises", json={"name": "Squat"})).json()
    leg_press = (await auth_client.post("/api/exercises", json={"name": "Leg Press"})).json()
    hack_squat = (await auth_client.post("/api/exercises", json={"name": "Hack Squat"})).json()

    await auth_client.post(f"/api/exercises/{squat['id']}/replacements", json={"replacement_id": leg_press["id"]})
    await auth_client.post(f"/api/exercises/{squat['id']}/replacements", json={"replacement_id": hack_squat["id"]})

    resp = await auth_client.get(f"/api/exercises/{squat['id']}/replacements")
    assert resp.status_code == 200
    names = {r["name"] for r in resp.json()}
    assert names == {"Leg Press", "Hack Squat"}


async def test_add_duplicate_replacement_returns_409(auth_client: AsyncClient, db_session: None) -> None:
    squat = (await auth_client.post("/api/exercises", json={"name": "Squat"})).json()
    leg_press = (await auth_client.post("/api/exercises", json={"name": "Leg Press"})).json()

    await auth_client.post(f"/api/exercises/{squat['id']}/replacements", json={"replacement_id": leg_press["id"]})
    resp = await auth_client.post(
        f"/api/exercises/{squat['id']}/replacements", json={"replacement_id": leg_press["id"]}
    )
    assert resp.status_code == 409


async def test_add_self_as_replacement_returns_400(auth_client: AsyncClient, db_session: None) -> None:
    squat = (await auth_client.post("/api/exercises", json={"name": "Squat"})).json()
    resp = await auth_client.post(
        f"/api/exercises/{squat['id']}/replacements", json={"replacement_id": squat["id"]}
    )
    assert resp.status_code == 400


async def test_remove_replacement(auth_client: AsyncClient, db_session: None) -> None:
    squat = (await auth_client.post("/api/exercises", json={"name": "Squat"})).json()
    leg_press = (await auth_client.post("/api/exercises", json={"name": "Leg Press"})).json()

    await auth_client.post(f"/api/exercises/{squat['id']}/replacements", json={"replacement_id": leg_press["id"]})
    resp = await auth_client.delete(f"/api/exercises/{squat['id']}/replacements/{leg_press['id']}")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_remove_nonexistent_replacement_returns_404(auth_client: AsyncClient, db_session: None) -> None:
    squat = (await auth_client.post("/api/exercises", json={"name": "Squat"})).json()
    resp = await auth_client.delete(f"/api/exercises/{squat['id']}/replacements/9999")
    assert resp.status_code == 404


async def test_replacements_are_user_scoped(
    auth_client: AsyncClient,
    auth_client_2: AsyncClient,
    db_session: None,
) -> None:
    squat = (await auth_client.post("/api/exercises", json={"name": "Squat"})).json()
    resp = await auth_client_2.get(f"/api/exercises/{squat['id']}/replacements")
    assert resp.status_code == 404


async def test_cannot_add_other_users_exercise_as_replacement(
    auth_client: AsyncClient,
    auth_client_2: AsyncClient,
    db_session: None,
) -> None:
    squat = (await auth_client.post("/api/exercises", json={"name": "Squat"})).json()
    other_ex = (await auth_client_2.post("/api/exercises", json={"name": "Other Squat"})).json()

    resp = await auth_client.post(
        f"/api/exercises/{squat['id']}/replacements",
        json={"replacement_id": other_ex["id"]},
    )
    assert resp.status_code == 404


async def test_replacements_not_in_exercise_list_response(auth_client: AsyncClient, db_session: None) -> None:
    squat = (await auth_client.post("/api/exercises", json={"name": "Squat"})).json()
    leg_press = (await auth_client.post("/api/exercises", json={"name": "Leg Press"})).json()
    await auth_client.post(f"/api/exercises/{squat['id']}/replacements", json={"replacement_id": leg_press["id"]})

    list_resp = await auth_client.get("/api/exercises")
    assert list_resp.status_code == 200
    squat_in_list = next(e for e in list_resp.json() if e["id"] == squat["id"])
    assert "replacements" not in squat_in_list


STACK_15 = {"kind": "stack", "top_lb": 10, "plate_lb": 15, "plates": 26}
INCREMENT_2_5 = {"kind": "increment", "step_kg": 2.5}


async def test_create_exercise_defaults_weight_scale_to_null(
    auth_client: AsyncClient, db_session: None
) -> None:
    resp = await auth_client.post("/api/exercises", json={"name": "Squat"})
    assert resp.status_code == 201
    assert resp.json()["weight_scale"] is None


async def test_create_exercise_with_stack_weight_scale(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.post("/api/exercises", json={"name": "Leg press", "weight_scale": STACK_15})
    assert resp.status_code == 201
    assert resp.json()["weight_scale"] == STACK_15
    listed = next(e for e in (await auth_client.get("/api/exercises")).json() if e["name"] == "Leg press")
    assert listed["weight_scale"] == STACK_15


async def test_create_exercise_with_increment_weight_scale(
    auth_client: AsyncClient, db_session: None
) -> None:
    resp = await auth_client.post(
        "/api/exercises", json={"name": "Dumbbell curl", "weight_scale": INCREMENT_2_5}
    )
    assert resp.status_code == 201
    assert resp.json()["weight_scale"] == INCREMENT_2_5


async def test_create_stack_without_plate_count_is_unbounded(
    auth_client: AsyncClient, db_session: None
) -> None:
    scale = {"kind": "stack", "top_lb": 10, "plate_lb": 10}
    resp = await auth_client.post("/api/exercises", json={"name": "Row", "weight_scale": scale})
    assert resp.status_code == 201
    assert resp.json()["weight_scale"] == {**scale, "plates": None}


async def test_patch_weight_scale_sets_it(auth_client: AsyncClient, db_session: None) -> None:
    eid = (await auth_client.post("/api/exercises", json={"name": "Row"})).json()["id"]
    resp = await auth_client.patch(f"/api/exercises/{eid}", json={"weight_scale": INCREMENT_2_5})
    assert resp.status_code == 200
    assert resp.json()["weight_scale"] == INCREMENT_2_5


async def test_patch_without_weight_scale_keeps_it(auth_client: AsyncClient, db_session: None) -> None:
    eid = (await auth_client.post("/api/exercises", json={"name": "Row", "weight_scale": STACK_15})).json()["id"]
    resp = await auth_client.patch(f"/api/exercises/{eid}", json={"notes": "Slow negatives"})
    assert resp.status_code == 200
    assert resp.json()["weight_scale"] == STACK_15


async def test_patch_null_weight_scale_clears_it(auth_client: AsyncClient, db_session: None) -> None:
    eid = (await auth_client.post("/api/exercises", json={"name": "Row", "weight_scale": STACK_15})).json()["id"]
    resp = await auth_client.patch(f"/api/exercises/{eid}", json={"weight_scale": None})
    assert resp.status_code == 200
    assert resp.json()["weight_scale"] is None
    listed = next(e for e in (await auth_client.get("/api/exercises")).json() if e["name"] == "Row")
    assert listed["weight_scale"] is None


@pytest.mark.parametrize(
    "scale",
    [
        {"kind": "barbell", "step_kg": 2.5},
        {"top_lb": 10, "plate_lb": 10},
        {"kind": "stack", "top_lb": 10},
        {"kind": "stack", "top_lb": 0, "plate_lb": 10},
        {"kind": "stack", "top_lb": 0.5, "plate_lb": 10},
        {"kind": "stack", "top_lb": 10, "plate_lb": 0},
        {"kind": "stack", "top_lb": 10, "plate_lb": 1e-20, "plates": 20},
        {"kind": "stack", "top_lb": 10, "plate_lb": 0.99},
        {"kind": "stack", "top_lb": 10, "plate_lb": 51},
        {"kind": "stack", "top_lb": 10, "plate_lb": 10, "plates": 0},
        {"kind": "stack", "top_lb": 10, "plate_lb": 10, "plates": 101},
        {"kind": "stack", "top_lb": 10, "plate_lb": 10, "plates": 2.5},
        {"kind": "stack", "top_lb": "10", "plate_lb": 10},
        {"kind": "increment", "step_kg": "2.5"},
        {"kind": "increment", "step_kg": 0},
        {"kind": "increment", "step_kg": 21},
        {"kind": "increment", "step_kg": 0.125},
        {"kind": "increment", "step_kg": 0.001},
        {"kind": "increment"},
        "stack",
    ],
)
async def test_create_exercise_rejects_invalid_weight_scale(
    auth_client: AsyncClient, db_session: None, scale: object
) -> None:
    resp = await auth_client.post("/api/exercises", json={"name": "Bad", "weight_scale": scale})
    assert resp.status_code == 422


async def test_patch_rejects_invalid_weight_scale(auth_client: AsyncClient, db_session: None) -> None:
    eid = (await auth_client.post("/api/exercises", json={"name": "Row"})).json()["id"]
    resp = await auth_client.patch(
        f"/api/exercises/{eid}", json={"weight_scale": {"kind": "increment", "step_kg": -1}}
    )
    assert resp.status_code == 422
    assert (await auth_client.get("/api/exercises")).json()[0]["weight_scale"] is None


async def test_patch_rejects_off_grid_and_tiny_weight_scales(auth_client: AsyncClient, db_session: None) -> None:
    eid = (await auth_client.post("/api/exercises", json={"name": "Row", "weight_scale": STACK_15})).json()["id"]
    for scale in [
        {"kind": "increment", "step_kg": 0.125},
        {"kind": "increment", "step_kg": 0.001},
        {"kind": "stack", "top_lb": 10, "plate_lb": 1e-20, "plates": 20},
    ]:
        resp = await auth_client.patch(f"/api/exercises/{eid}", json={"weight_scale": scale})
        assert resp.status_code == 422, scale
    assert (await auth_client.get("/api/exercises")).json()[0]["weight_scale"] == STACK_15


async def test_create_accepts_the_smallest_steps(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.post(
        "/api/exercises", json={"name": "Pin stack", "weight_scale": {"kind": "stack", "top_lb": 1, "plate_lb": 1}}
    )
    assert resp.status_code == 201
    resp = await auth_client.post(
        "/api/exercises", json={"name": "Micro", "weight_scale": {"kind": "increment", "step_kg": 0.25}}
    )
    assert resp.status_code == 201
    assert resp.json()["weight_scale"] == {"kind": "increment", "step_kg": 0.25}


async def _weight_scale_is_sql_null(db_session: async_sessionmaker, exercise_id: int) -> bool:
    async with db_session() as session:
        result = await session.execute(
            text("SELECT weight_scale IS NULL FROM exercises WHERE id = :id"), {"id": exercise_id}
        )
        return bool(result.scalar_one())


async def test_unset_weight_scale_is_stored_as_sql_null(
    auth_client: AsyncClient, db_session: async_sessionmaker
) -> None:
    eid = (await auth_client.post("/api/exercises", json={"name": "Squat"})).json()["id"]
    assert await _weight_scale_is_sql_null(db_session, eid)


async def test_cleared_weight_scale_is_stored_as_sql_null(
    auth_client: AsyncClient, db_session: async_sessionmaker
) -> None:
    eid = (await auth_client.post("/api/exercises", json={"name": "Row", "weight_scale": STACK_15})).json()["id"]
    assert not await _weight_scale_is_sql_null(db_session, eid)
    await auth_client.patch(f"/api/exercises/{eid}", json={"weight_scale": None})
    assert await _weight_scale_is_sql_null(db_session, eid)
