from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.cardio_activity_type import CardioActivityType
from app.models.pending_import import ImportSource, ImportStatus, PendingImport
from app.models.user_settings import UserSettings
from app.services import crypto

STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_API_BASE = "https://www.strava.com/api/v3"

# Strava types that become strength sessions (duration-only, no segments)
_STRENGTH_TYPES: frozenset[str] = frozenset(
    {
        "weighttraining",
        "functionalstrengthtraining",
        "crossfit",
        "yoga",
        "pilates",
        "stretching",
    }
)

# Strava type (lowercased) → Trainlytics activity type name to look up in DB.
# Only needed when the Strava name differs from the Trainlytics name.
_TYPE_ALIAS: dict[str, str] = {
    "ride": "cycle",
    "virtualride": "cycle",
    "ebikeride": "cycle",
    "mountainbikeride": "cycle",
    "handcycle": "cycle",
}


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


async def map_strava_type(strava_type: str, db: AsyncSession, user_id: str) -> dict:
    """Map a Strava activity type string to Trainlytics session metadata.

    Returns a dict with:
      session_type:       "cardio" | "strength"
      activity_type_name: matched Trainlytics name, or None
      proposed_type_name: original Strava type when no match found, or None
    """
    lower = strava_type.lower()

    if lower in _STRENGTH_TYPES:
        return {"session_type": "strength", "activity_type_name": None, "proposed_type_name": None}

    lookup_name = _TYPE_ALIAS.get(lower, strava_type)

    result = await db.execute(
        select(CardioActivityType).where(
            CardioActivityType.user_id == user_id,
            func.lower(CardioActivityType.name) == lookup_name.lower(),
        )
    )
    cat = result.scalar_one_or_none()

    if cat:
        return {"session_type": "cardio", "activity_type_name": cat.name, "proposed_type_name": None}

    return {"session_type": "cardio", "activity_type_name": None, "proposed_type_name": strava_type}


def _build_segment(lap: dict, activity_type_name: str | None) -> dict:
    dist = lap.get("distance") or 0.0
    dur = int(lap.get("elapsed_time") or 0)
    pace = (dur / (dist / 1000)) if dist > 0 else None
    return {
        "distance_m": dist,
        "duration_seconds": dur,
        "pace_s_per_km": pace,
        "activity_type": activity_type_name,
    }


def _after_timestamp(row: UserSettings) -> int | None:
    candidates: list[int] = []
    if row.strava_sync_start_date:
        dt = datetime.combine(row.strava_sync_start_date, datetime.min.time()).replace(
            tzinfo=timezone.utc
        )
        candidates.append(int(dt.timestamp()))
    if row.strava_last_synced_at:
        candidates.append(int(row.strava_last_synced_at.timestamp()))
    return max(candidates) if candidates else None


async def fetch_activities_worker(username: str) -> None:
    """Background worker: fetch Strava activities and stage them as pending imports."""
    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(UserSettings).where(UserSettings.username == username))
        row = result.scalar_one_or_none()
        if not row or not row.strava_access_token:
            return

        try:
            token = await ensure_fresh_token(db, row)
        except Exception:
            return

        after = _after_timestamp(row)
        headers = {"Authorization": f"Bearer {token}"}

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Paginate through all activities
                all_activities: list[dict] = []
                page = 1
                while True:
                    params: dict = {"per_page": 200, "page": page}
                    if after is not None:
                        params["after"] = after
                    resp = await client.get(
                        f"{STRAVA_API_BASE}/athlete/activities",
                        headers=headers,
                        params=params,
                    )
                    resp.raise_for_status()
                    batch = resp.json()
                    if not batch:
                        break
                    all_activities.extend(batch)
                    page += 1

                for activity in all_activities:
                    await _stage_activity(db, client, headers, activity, username)

        except Exception:
            return
        finally:
            row.strava_last_synced_at = datetime.now(timezone.utc)
            await db.commit()


async def _stage_activity(
    db: AsyncSession,
    client: httpx.AsyncClient,
    headers: dict,
    activity: dict,
    username: str,
) -> None:
    external_id = str(activity["id"])

    existing_result = await db.execute(
        select(PendingImport).where(
            PendingImport.source == ImportSource.strava.value,
            PendingImport.external_id == external_id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing and existing.status in (ImportStatus.accepted.value, ImportStatus.discarded.value):
        return

    # Fetch lap detail
    try:
        laps_resp = await client.get(
            f"{STRAVA_API_BASE}/activities/{external_id}/laps", headers=headers
        )
        laps: list[dict] = laps_resp.json() if laps_resp.status_code == 200 else []
    except Exception:
        laps = []

    type_info = await map_strava_type(activity.get("type", ""), db, username)
    session_type: str = type_info["session_type"]
    activity_type_name: str | None = type_info["activity_type_name"]

    if session_type == "cardio":
        if laps:
            segments = [_build_segment(lap, activity_type_name) for lap in laps]
        else:
            segments = [
                _build_segment(
                    {
                        "distance": activity.get("distance"),
                        "elapsed_time": activity.get("elapsed_time"),
                    },
                    activity_type_name,
                )
            ]
    else:
        segments = []

    start_date_local: str = activity.get("start_date_local", "")
    mapped: dict = {
        "type": session_type,
        "source": "strava",
        "activity_type": activity_type_name,
        "date": start_date_local[:10] if start_date_local else None,
        "duration_seconds": activity.get("elapsed_time"),
        "distance_m": activity.get("distance") if session_type == "cardio" else None,
        "calories": activity.get("calories"),
        "avg_hr_bpm": activity.get("average_heartrate"),
        "title": activity.get("name"),
        "segments": segments,
    }
    if type_info["proposed_type_name"]:
        mapped["proposed_type_name"] = type_info["proposed_type_name"]

    if existing:
        existing.raw_data = activity
        existing.mapped_session = mapped
    else:
        db.add(
            PendingImport(
                source=ImportSource.strava.value,
                external_id=external_id,
                raw_data=activity,
                mapped_session=mapped,
                status=ImportStatus.pending.value,
            )
        )

    await db.commit()
