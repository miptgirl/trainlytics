from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user_settings import UserSettings
from app.services import crypto

STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"


def is_configured() -> bool:
    return bool(
        settings.strava_client_id
        and settings.strava_client_secret
        and settings.strava_redirect_uri
    )


def build_auth_url(state: str) -> str:
    params = {
        "client_id": settings.strava_client_id,
        "redirect_uri": settings.strava_redirect_uri,
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": "activity:read_all",
        "state": state,
    }
    return f"{STRAVA_AUTH_URL}?{urlencode(params)}"


async def exchange_code(code: str) -> dict:
    """Exchange an authorization code for Strava tokens. Returns the token response dict."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            STRAVA_TOKEN_URL,
            data={
                "client_id": settings.strava_client_id,
                "client_secret": settings.strava_client_secret,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        resp.raise_for_status()
        return resp.json()


async def ensure_fresh_token(db: AsyncSession, row: UserSettings) -> str:
    """Return a valid access token, refreshing silently if expired. Commits updates to row."""
    if not row.strava_access_token:
        raise ValueError("Strava not connected")

    now = datetime.now(timezone.utc)
    expires_at = row.strava_token_expires_at
    needs_refresh = expires_at is None or expires_at <= now + timedelta(minutes=5)

    if not needs_refresh:
        return crypto.decrypt(row.strava_access_token)

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            STRAVA_TOKEN_URL,
            data={
                "client_id": settings.strava_client_id,
                "client_secret": settings.strava_client_secret,
                "refresh_token": crypto.decrypt(row.strava_refresh_token),
                "grant_type": "refresh_token",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    row.strava_access_token = crypto.encrypt(data["access_token"])
    row.strava_refresh_token = crypto.encrypt(data["refresh_token"])
    row.strava_token_expires_at = datetime.fromtimestamp(data["expires_at"], tz=timezone.utc)
    await db.commit()

    return data["access_token"]
