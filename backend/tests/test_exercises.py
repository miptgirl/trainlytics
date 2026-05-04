from httpx import AsyncClient

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
