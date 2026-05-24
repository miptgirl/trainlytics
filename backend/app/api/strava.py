from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_token, decode_token
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user_settings import UserSettings
from app.services import crypto
from app.services import strava_service

router = APIRouter(prefix="/strava", tags=["strava"])


def _require_strava() -> None:
    if not strava_service.is_configured():
        raise HTTPException(status_code=503, detail="Strava integration not configured")


@router.get("/auth-url")
async def get_auth_url(
    username: str = Depends(get_current_user),
) -> dict:
    _require_strava()
    state = create_token({"sub": username, "type": "strava_oauth"}, timedelta(minutes=10))
    return {"url": strava_service.build_auth_url(state)}


@router.get("/callback")
async def strava_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    frontend_url = settings.frontend_url

    if error or not code or not state:
        return RedirectResponse(f"{frontend_url}/#/profile?strava=error")

    username = decode_token(state)
    if not username:
        return RedirectResponse(f"{frontend_url}/#/profile?strava=error")

    try:
        data = await strava_service.exchange_code(code)
    except Exception:
        return RedirectResponse(f"{frontend_url}/#/profile?strava=error")

    from datetime import datetime, timezone

    result = await db.execute(select(UserSettings).where(UserSettings.username == username))
    row = result.scalar_one_or_none()
    if row is None:
        row = UserSettings(username=username)
        db.add(row)

    row.strava_access_token = crypto.encrypt(data["access_token"])
    row.strava_refresh_token = crypto.encrypt(data["refresh_token"])
    row.strava_token_expires_at = datetime.fromtimestamp(data["expires_at"], tz=timezone.utc)
    row.strava_athlete_id = data.get("athlete", {}).get("id")

    await db.commit()
    return RedirectResponse(f"{frontend_url}/#/profile?strava=connected")


@router.post("/fetch")
async def fetch_activities(
    background_tasks: BackgroundTasks,
    username: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    _require_strava()
    result = await db.execute(select(UserSettings).where(UserSettings.username == username))
    row = result.scalar_one_or_none()
    if not row or not row.strava_access_token:
        raise HTTPException(status_code=400, detail="Strava not connected")
    background_tasks.add_task(strava_service.fetch_activities_worker, username)
    return {"queued": True}


@router.delete("/disconnect")
async def disconnect_strava(
    username: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(UserSettings).where(UserSettings.username == username))
    row = result.scalar_one_or_none()
    if row is not None:
        row.strava_access_token = None
        row.strava_refresh_token = None
        row.strava_token_expires_at = None
        row.strava_athlete_id = None
        row.strava_last_synced_at = None
        row.strava_sync_start_date = None
        await db.commit()
    return {"disconnected": True}
