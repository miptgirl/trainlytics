from httpx import AsyncClient

from tests.conftest import TEST_USERNAME


async def test_list_cardio_types_empty(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.get("/api/cardio-types")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_cardio_type(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.post("/api/cardio-types", json={"name": "Run"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Run"
    assert body["user_id"] == TEST_USERNAME
    assert "id" in body
    assert "created_at" in body


async def test_list_cardio_types(auth_client: AsyncClient, db_session: None) -> None:
    await auth_client.post("/api/cardio-types", json={"name": "Run"})
    await auth_client.post("/api/cardio-types", json={"name": "Cycling"})
    resp = await auth_client.get("/api/cardio-types")
    assert resp.status_code == 200
    names = [t["name"] for t in resp.json()]
    assert "Run" in names
    assert "Cycling" in names


async def test_rename_cardio_type(auth_client: AsyncClient, db_session: None) -> None:
    create = await auth_client.post("/api/cardio-types", json={"name": "Trail Run"})
    tid = create.json()["id"]
    resp = await auth_client.patch(f"/api/cardio-types/{tid}", json={"name": "Trail Running"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Trail Running"


async def test_delete_cardio_type(auth_client: AsyncClient, db_session: None) -> None:
    create = await auth_client.post("/api/cardio-types", json={"name": "Swim"})
    tid = create.json()["id"]
    del_resp = await auth_client.delete(f"/api/cardio-types/{tid}")
    assert del_resp.status_code == 204
    list_resp = await auth_client.get("/api/cardio-types")
    assert all(t["id"] != tid for t in list_resp.json())


async def test_cardio_type_not_found(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.patch("/api/cardio-types/9999", json={"name": "Ghost"})
    assert resp.status_code == 404


async def test_cardio_type_requires_auth(client: AsyncClient, db_session: None) -> None:
    resp = await client.get("/api/cardio-types")
    assert resp.status_code == 401


async def test_cardio_type_user_isolation(
    auth_client: AsyncClient,
    auth_client_2: AsyncClient,
    db_session: None,
) -> None:
    await auth_client.post("/api/cardio-types", json={"name": "User1 Swim"})
    resp = await auth_client_2.get("/api/cardio-types")
    assert resp.status_code == 200
    assert all(t["name"] != "User1 Swim" for t in resp.json())


async def test_cardio_type_cannot_edit_other_users(
    auth_client: AsyncClient,
    auth_client_2: AsyncClient,
    db_session: None,
) -> None:
    create = await auth_client.post("/api/cardio-types", json={"name": "Mine"})
    tid = create.json()["id"]
    resp = await auth_client_2.patch(f"/api/cardio-types/{tid}", json={"name": "Stolen"})
    assert resp.status_code == 404
