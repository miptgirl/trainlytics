from httpx import AsyncClient

from tests.conftest import TEST_USERNAME


async def test_list_exercise_types_empty(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.get("/api/exercise-types")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_exercise_type(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.post("/api/exercise-types", json={"name": "Push"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Push"
    assert body["user_id"] == TEST_USERNAME
    assert "id" in body
    assert "created_at" in body


async def test_list_exercise_types(auth_client: AsyncClient, db_session: None) -> None:
    await auth_client.post("/api/exercise-types", json={"name": "Push"})
    await auth_client.post("/api/exercise-types", json={"name": "Pull"})
    resp = await auth_client.get("/api/exercise-types")
    assert resp.status_code == 200
    names = [t["name"] for t in resp.json()]
    assert "Push" in names
    assert "Pull" in names


async def test_rename_exercise_type(auth_client: AsyncClient, db_session: None) -> None:
    create = await auth_client.post("/api/exercise-types", json={"name": "Legs"})
    tid = create.json()["id"]
    resp = await auth_client.patch(f"/api/exercise-types/{tid}", json={"name": "Lower Body"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Lower Body"


async def test_delete_exercise_type(auth_client: AsyncClient, db_session: None) -> None:
    create = await auth_client.post("/api/exercise-types", json={"name": "Core"})
    tid = create.json()["id"]
    del_resp = await auth_client.delete(f"/api/exercise-types/{tid}")
    assert del_resp.status_code == 204
    list_resp = await auth_client.get("/api/exercise-types")
    assert all(t["id"] != tid for t in list_resp.json())


async def test_exercise_type_not_found(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.patch("/api/exercise-types/9999", json={"name": "Ghost"})
    assert resp.status_code == 404


async def test_exercise_type_requires_auth(client: AsyncClient, db_session: None) -> None:
    resp = await client.get("/api/exercise-types")
    assert resp.status_code == 401


async def test_exercise_types_user_isolation(
    auth_client: AsyncClient,
    auth_client_2: AsyncClient,
    db_session: None,
) -> None:
    await auth_client.post("/api/exercise-types", json={"name": "User1 Push"})
    resp = await auth_client_2.get("/api/exercise-types")
    assert resp.status_code == 200
    assert all(t["name"] != "User1 Push" for t in resp.json())


async def test_exercise_type_cannot_edit_other_users(
    auth_client: AsyncClient,
    auth_client_2: AsyncClient,
    db_session: None,
) -> None:
    create = await auth_client.post("/api/exercise-types", json={"name": "Mine"})
    tid = create.json()["id"]
    resp = await auth_client_2.patch(f"/api/exercise-types/{tid}", json={"name": "Stolen"})
    assert resp.status_code == 404


async def test_exercise_type_cannot_delete_other_users(
    auth_client: AsyncClient,
    auth_client_2: AsyncClient,
    db_session: None,
) -> None:
    create = await auth_client.post("/api/exercise-types", json={"name": "Mine"})
    tid = create.json()["id"]
    resp = await auth_client_2.delete(f"/api/exercise-types/{tid}")
    assert resp.status_code == 404


async def test_delete_exercise_type_cascades_join_table(
    auth_client: AsyncClient,
    db_session: None,
) -> None:
    """Deleting an exercise type should remove the join table rows."""
    type_resp = await auth_client.post("/api/exercise-types", json={"name": "Push"})
    tid = type_resp.json()["id"]
    ex_resp = await auth_client.post("/api/exercises", json={"name": "Bench Press", "type_ids": [tid]})
    eid = ex_resp.json()["id"]

    await auth_client.delete(f"/api/exercise-types/{tid}")

    ex_detail = await auth_client.get("/api/exercises")
    exercise = next(e for e in ex_detail.json() if e["id"] == eid)
    assert exercise["types"] == []


async def test_delete_exercise_cascades_join_table(
    auth_client: AsyncClient,
    db_session: None,
) -> None:
    """Deleting an exercise should not leave orphan rows in the join table (no error on type list)."""
    type_resp = await auth_client.post("/api/exercise-types", json={"name": "Pull"})
    tid = type_resp.json()["id"]
    ex_resp = await auth_client.post("/api/exercises", json={"name": "Pull-up", "type_ids": [tid]})
    eid = ex_resp.json()["id"]

    del_resp = await auth_client.delete(f"/api/exercises/{eid}")
    assert del_resp.status_code == 204

    # Type still exists, unaffected
    types_resp = await auth_client.get("/api/exercise-types")
    assert any(t["id"] == tid for t in types_resp.json())
