import pytest
import bcrypt
from httpx import AsyncClient, ASGITransport

from app.config import settings
from app.main import app

TEST_USERNAME = "testuser"
TEST_PASSWORD = "testpass"

# Low-cost hash (rounds=4) so tests run fast
_TEST_HASH = bcrypt.hashpw(TEST_PASSWORD.encode(), bcrypt.gensalt(rounds=4)).decode()


@pytest.fixture(autouse=True)
def patch_users(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "users", f"{TEST_USERNAME}:{_TEST_HASH}")


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def auth_client(client: AsyncClient) -> AsyncClient:
    """Client with a valid access token pre-set."""
    resp = await client.post("/api/auth/login", json={"username": TEST_USERNAME, "password": TEST_PASSWORD})
    token = resp.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client
