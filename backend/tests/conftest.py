import pytest
import bcrypt
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.database import Base, get_db
from app.main import app

TEST_USERNAME = "testuser"
TEST_PASSWORD = "testpass"
TEST_USERNAME_2 = "otheruser"
TEST_PASSWORD_2 = "otherpass"

# Low-cost hashes (rounds=4) so tests run fast
_TEST_HASH = bcrypt.hashpw(TEST_PASSWORD.encode(), bcrypt.gensalt(rounds=4)).decode()
_TEST_HASH_2 = bcrypt.hashpw(TEST_PASSWORD_2.encode(), bcrypt.gensalt(rounds=4)).decode()


@pytest.fixture(autouse=True)
def patch_users(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        settings,
        "users",
        f"{TEST_USERNAME}:{_TEST_HASH},{TEST_USERNAME_2}:{_TEST_HASH_2}",
    )


@pytest.fixture
async def db_session() -> None:
    """In-memory SQLite database; overrides get_db for the duration of a test."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db() -> AsyncSession:
        async with Session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    await engine.dispose()


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def auth_client() -> AsyncClient:
    """Fresh client authenticated as TEST_USERNAME."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/auth/login", json={"username": TEST_USERNAME, "password": TEST_PASSWORD})
        c.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"
        yield c


@pytest.fixture
async def auth_client_2() -> AsyncClient:
    """Fresh client authenticated as TEST_USERNAME_2."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/auth/login", json={"username": TEST_USERNAME_2, "password": TEST_PASSWORD_2})
        c.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"
        yield c
