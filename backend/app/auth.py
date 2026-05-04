from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import settings


def parse_users(users_str: str) -> dict[str, str]:
    """Parse USERS env var ('user:hash,user2:hash2') into {username: hashed_password}."""
    result: dict[str, str] = {}
    for entry in users_str.split(","):
        entry = entry.strip()
        if ":" not in entry:
            continue
        username, hashed = entry.split(":", 1)
        result[username.strip()] = hashed.strip()
    return result


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def authenticate_user(username: str, password: str) -> bool:
    users = parse_users(settings.users)
    hashed = users.get(username)
    if not hashed:
        return False
    return verify_password(password, hashed)


def create_token(data: dict, expires_delta: timedelta) -> str:
    payload = {**data, "exp": datetime.now(timezone.utc) + expires_delta}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> str | None:
    """Returns username (sub claim) if token is valid, None otherwise."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload.get("sub")
    except JWTError:
        return None
