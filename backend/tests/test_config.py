"""Settings read only the exact upper-case env names, from the environment and from .env."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.config import Settings

ENV_NAMES = {name.upper() for name in Settings.model_fields}

# Every field: env name → (raw value, parsed value); none equals the default
ENV_VALUES: dict[str, tuple[str, object]] = {
    "DATABASE_URL": ("postgresql+asyncpg://u:p@host:5432/db", "postgresql+asyncpg://u:p@host:5432/db"),
    "SECRET_KEY": ("from-env", "from-env"),
    "ALGORITHM": ("HS512", "HS512"),
    "ACCESS_TOKEN_EXPIRE_MINUTES": ("15", 15),
    "REFRESH_TOKEN_EXPIRE_DAYS": ("30", 30),
    "COOKIE_SECURE": ("true", True),
    "USERS": ("alice:hash", "alice:hash"),
    "DEMO_USER_ENABLED": ("true", True),
    "DEBUG_SQL_ENABLED": ("true", True),
    "FRONTEND_URL": ("https://app.test", "https://app.test"),
    "STRAVA_CLIENT_ID": ("123", "123"),
    "STRAVA_CLIENT_SECRET": ("shh", "shh"),
    "STRAVA_REDIRECT_URI": ("https://app.test/cb", "https://app.test/cb"),
}


@pytest.fixture
def clean_env(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    """Removes every case variant of the settings' env names from the environment."""
    for key in list(os.environ):
        if key.upper() in ENV_NAMES:
            monkeypatch.delenv(key)
    return monkeypatch


def test_env_values_cover_every_field() -> None:
    assert set(ENV_VALUES) == ENV_NAMES


def test_every_field_loads_from_its_uppercase_env_name(clean_env: pytest.MonkeyPatch) -> None:
    for name, (raw, _) in ENV_VALUES.items():
        clean_env.setenv(name, raw)
    s = Settings(_env_file=None)
    for name, (_, parsed) in ENV_VALUES.items():
        assert getattr(s, name.lower()) == parsed, name


@pytest.mark.parametrize("transform", [str.lower, str.title], ids=["lowercase", "mixed-case"])
def test_other_case_variants_are_ignored(clean_env: pytest.MonkeyPatch, transform) -> None:
    defaults = Settings(_env_file=None).model_dump()
    for name, (raw, _) in ENV_VALUES.items():
        clean_env.setenv(transform(name), raw)
    assert Settings(_env_file=None).model_dump() == defaults


@pytest.mark.parametrize("lowercase_first", [False, True], ids=["upper-first", "lower-first"])
def test_lowercase_cannot_override_a_pinned_uppercase_value(
    clean_env: pytest.MonkeyPatch, lowercase_first: bool
) -> None:
    """Prod compose pins DEMO_USER_ENABLED=false; a lower-case .env line can't turn it on."""
    pinned = [("DEMO_USER_ENABLED", "false"), ("DEBUG_SQL_ENABLED", "true")]
    lowercase = [("demo_user_enabled", "true"), ("debug_sql_enabled", "true")]
    for key, value in (lowercase + pinned) if lowercase_first else (pinned + lowercase):
        clean_env.setenv(key, value)
    s = Settings(_env_file=None)
    assert s.demo_user_enabled is False
    assert s.debug_sql_enabled is True
    assert s.debug_sql_available is False


def test_dotenv_reads_only_uppercase_names(clean_env: pytest.MonkeyPatch, tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "SECRET_KEY=from-dotenv\n"
        "DEMO_USER_ENABLED=false\n"
        "demo_user_enabled=true\n"
        "debug_sql_enabled=true\n"
    )
    s = Settings(_env_file=env_file)
    assert s.secret_key == "from-dotenv"
    assert s.demo_user_enabled is False
    assert s.debug_sql_enabled is False
