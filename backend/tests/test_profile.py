"""Tests for GET /profile and PATCH /profile."""

import pytest
from httpx import AsyncClient

from tests.conftest import TEST_USERNAME


@pytest.mark.anyio
async def test_get_profile_no_row(db_session, auth_client: AsyncClient):
    """GET /profile with no row returns defaults."""
    resp = await auth_client.get("/api/profile")
    assert resp.status_code == 200
    data = resp.json()
    assert data["display_name"] is None
    assert data["birth_year"] is None
    assert data["experience_level"] is None
    assert data["goals"] == []
    assert data["injury_notes"] is None
    assert data["coach_notes"] is None
    assert data["has_anthropic_key"] is False
    assert data["has_openai_key"] is False
    assert data["ai_provider"] is None


@pytest.mark.anyio
async def test_patch_display_name(db_session, auth_client: AsyncClient):
    resp = await auth_client.patch("/api/profile", json={"display_name": "Marie"})
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Marie"

    # Verify persistence
    resp2 = await auth_client.get("/api/profile")
    assert resp2.json()["display_name"] == "Marie"


@pytest.mark.anyio
async def test_patch_birth_year(db_session, auth_client: AsyncClient):
    resp = await auth_client.patch("/api/profile", json={"birth_year": 1990})
    assert resp.status_code == 200
    assert resp.json()["birth_year"] == 1990

    resp2 = await auth_client.get("/api/profile")
    assert resp2.json()["birth_year"] == 1990


@pytest.mark.anyio
async def test_patch_experience_level(db_session, auth_client: AsyncClient):
    resp = await auth_client.patch("/api/profile", json={"experience_level": "intermediate"})
    assert resp.status_code == 200
    assert resp.json()["experience_level"] == "intermediate"


@pytest.mark.anyio
async def test_patch_goals_add_and_remove(db_session, auth_client: AsyncClient):
    goals = [
        {"text": "Run a 5K", "priority": "high"},
        {"text": "Improve mobility", "priority": "medium"},
    ]
    resp = await auth_client.patch("/api/profile", json={"goals": goals})
    assert resp.status_code == 200
    returned = resp.json()["goals"]
    assert len(returned) == 2
    assert returned[0]["text"] == "Run a 5K"

    # Remove one goal (full-array replacement)
    resp2 = await auth_client.patch("/api/profile", json={"goals": [goals[0]]})
    assert len(resp2.json()["goals"]) == 1


@pytest.mark.anyio
async def test_patch_goals_invalid_priority(db_session, auth_client: AsyncClient):
    resp = await auth_client.patch("/api/profile", json={"goals": [{"text": "x", "priority": "extreme"}]})
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_patch_injury_notes(db_session, auth_client: AsyncClient):
    resp = await auth_client.patch("/api/profile", json={"injury_notes": "bad left knee"})
    assert resp.status_code == 200
    assert resp.json()["injury_notes"] == "bad left knee"


@pytest.mark.anyio
async def test_patch_coach_notes(db_session, auth_client: AsyncClient):
    resp = await auth_client.patch("/api/profile", json={"coach_notes": "I train at 6am"})
    assert resp.status_code == 200
    assert resp.json()["coach_notes"] == "I train at 6am"


@pytest.mark.anyio
async def test_patch_anthropic_key(db_session, auth_client: AsyncClient):
    resp = await auth_client.patch("/api/profile", json={"anthropic_api_key": "sk-ant-test"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["has_anthropic_key"] is True
    # Raw key must not be returned
    assert "anthropic_api_key" not in data
    assert "anthropic_api_key_encrypted" not in data


@pytest.mark.anyio
async def test_patch_openai_key(db_session, auth_client: AsyncClient):
    resp = await auth_client.patch("/api/profile", json={"openai_api_key": "sk-openai-test"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["has_openai_key"] is True
    assert "openai_api_key" not in data


@pytest.mark.anyio
async def test_neither_key_returned_in_get(db_session, auth_client: AsyncClient):
    await auth_client.patch("/api/profile", json={"anthropic_api_key": "sk-ant", "openai_api_key": "sk-oai"})
    resp = await auth_client.get("/api/profile")
    data = resp.json()
    assert "anthropic_api_key" not in data
    assert "openai_api_key" not in data
    assert "anthropic_api_key_encrypted" not in data
    assert data["has_anthropic_key"] is True
    assert data["has_openai_key"] is True


@pytest.mark.anyio
async def test_clear_anthropic_key(db_session, auth_client: AsyncClient):
    await auth_client.patch("/api/profile", json={"anthropic_api_key": "sk-ant"})
    resp = await auth_client.patch("/api/profile", json={"anthropic_api_key": None})
    assert resp.status_code == 200
    assert resp.json()["has_anthropic_key"] is False


@pytest.mark.anyio
async def test_clear_openai_key(db_session, auth_client: AsyncClient):
    await auth_client.patch("/api/profile", json={"openai_api_key": "sk-oai"})
    resp = await auth_client.patch("/api/profile", json={"openai_api_key": None})
    assert resp.status_code == 200
    assert resp.json()["has_openai_key"] is False


@pytest.mark.anyio
async def test_clear_keys_independently(db_session, auth_client: AsyncClient):
    """Clearing one key does not affect the other."""
    await auth_client.patch("/api/profile", json={"anthropic_api_key": "sk-ant", "openai_api_key": "sk-oai"})
    await auth_client.patch("/api/profile", json={"anthropic_api_key": None})
    resp = await auth_client.get("/api/profile")
    data = resp.json()
    assert data["has_anthropic_key"] is False
    assert data["has_openai_key"] is True


@pytest.mark.anyio
async def test_patch_ai_provider(db_session, auth_client: AsyncClient):
    resp = await auth_client.patch("/api/profile", json={"ai_provider": "openai"})
    assert resp.status_code == 200
    assert resp.json()["ai_provider"] == "openai"
