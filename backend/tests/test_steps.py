from httpx import AsyncClient

from tests.conftest import TEST_USERNAME


async def test_list_steps_empty(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.get("/api/steps?start_date=2026-01-01&end_date=2026-12-31")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_step_entry(auth_client: AsyncClient, db_session: None) -> None:
    resp = await auth_client.post("/api/steps", json={"date": "2026-05-10", "steps": 9500})
    assert resp.status_code == 201
    body = resp.json()
    assert body["date"] == "2026-05-10"
    assert body["steps"] == 9500
    assert body["user_id"] == TEST_USERNAME
    assert "id" in body
    assert "created_at" in body
    assert "updated_at" in body


async def test_update_existing_date(auth_client: AsyncClient, db_session: None) -> None:
    await auth_client.post("/api/steps", json={"date": "2026-05-10", "steps": 5000})
    resp = await auth_client.post("/api/steps", json={"date": "2026-05-10", "steps": 9500})
    assert resp.status_code == 201
    assert resp.json()["steps"] == 9500
    list_resp = await auth_client.get("/api/steps?start_date=2026-05-10&end_date=2026-05-10")
    assert len(list_resp.json()) == 1
    assert list_resp.json()[0]["steps"] == 9500


async def test_fetch_range(auth_client: AsyncClient, db_session: None) -> None:
    await auth_client.post("/api/steps", json={"date": "2026-05-08", "steps": 7000})
    await auth_client.post("/api/steps", json={"date": "2026-05-09", "steps": 8000})
    await auth_client.post("/api/steps", json={"date": "2026-05-10", "steps": 9000})
    resp = await auth_client.get("/api/steps?start_date=2026-05-08&end_date=2026-05-09")
    assert resp.status_code == 200
    dates = [e["date"] for e in resp.json()]
    assert "2026-05-08" in dates
    assert "2026-05-09" in dates
    assert "2026-05-10" not in dates


async def test_fetch_range_ordered_descending(auth_client: AsyncClient, db_session: None) -> None:
    await auth_client.post("/api/steps", json={"date": "2026-05-08", "steps": 7000})
    await auth_client.post("/api/steps", json={"date": "2026-05-09", "steps": 8000})
    resp = await auth_client.get("/api/steps?start_date=2026-05-08&end_date=2026-05-09")
    assert resp.status_code == 200
    dates = [e["date"] for e in resp.json()]
    assert dates == sorted(dates, reverse=True)


async def test_fetch_empty_range(auth_client: AsyncClient, db_session: None) -> None:
    await auth_client.post("/api/steps", json={"date": "2026-05-10", "steps": 9000})
    resp = await auth_client.get("/api/steps?start_date=2026-01-01&end_date=2026-01-31")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_steps_requires_auth(client: AsyncClient, db_session: None) -> None:
    resp = await client.get("/api/steps?start_date=2026-01-01&end_date=2026-12-31")
    assert resp.status_code == 401


async def test_steps_user_isolation(
    auth_client: AsyncClient,
    auth_client_2: AsyncClient,
    db_session: None,
) -> None:
    await auth_client.post("/api/steps", json={"date": "2026-05-10", "steps": 9500})
    resp = await auth_client_2.get("/api/steps?start_date=2026-05-10&end_date=2026-05-10")
    assert resp.status_code == 200
    assert resp.json() == []
