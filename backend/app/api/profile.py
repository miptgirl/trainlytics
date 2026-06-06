from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user_settings import UserSettings
from app.schemas.user_settings import UserSettingsOut, UserSettingsPatch
from app.services import crypto
from app.services import strava_service

router = APIRouter(prefix="/profile", tags=["profile"])


def _row_to_out(row: UserSettings | None) -> UserSettingsOut:
    if row is None:
        return UserSettingsOut(strava_configured=strava_service.is_configured())
    from app.schemas.user_settings import GoalItem

    goals: list[GoalItem] = []
    if row.goals:
        for g in row.goals:
            try:
                goals.append(GoalItem(**g))
            except Exception:
                pass

    return UserSettingsOut(
        display_name=row.display_name,
        birth_year=row.birth_year,
        experience_level=row.experience_level,
        goals=goals,
        injury_notes=row.injury_notes,
        coach_notes=row.coach_notes,
        ai_provider=row.ai_provider,
        ai_key_configured=row.ai_key_encrypted is not None,
        strava_configured=strava_service.is_configured(),
        strava_connected=row.strava_access_token is not None,
        strava_athlete_name=row.strava_athlete_name,
        strava_athlete_avatar_url=row.strava_athlete_avatar_url,
        strava_last_synced_at=row.strava_last_synced_at,
        strava_sync_start_date=row.strava_sync_start_date,
        health_metric_resting_hr=row.health_metric_resting_hr,
        health_metric_hrv=row.health_metric_hrv,
        health_metric_weight=row.health_metric_weight,
        health_metric_sleep=row.health_metric_sleep,
        health_metric_vo2_max=row.health_metric_vo2_max,
        health_metric_active_energy=row.health_metric_active_energy,
    )


@router.get("", response_model=UserSettingsOut)
async def get_profile(
    username: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettingsOut:
    result = await db.execute(select(UserSettings).where(UserSettings.username == username))
    row = result.scalar_one_or_none()
    return _row_to_out(row)


@router.patch("", response_model=UserSettingsOut)
async def patch_profile(
    body: UserSettingsPatch,
    username: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettingsOut:
    result = await db.execute(select(UserSettings).where(UserSettings.username == username))
    row = result.scalar_one_or_none()

    if row is None:
        row = UserSettings(username=username)
        db.add(row)

    fields_set = body.model_fields_set

    if "display_name" in fields_set:
        row.display_name = body.display_name
    if "birth_year" in fields_set:
        row.birth_year = body.birth_year
    if "experience_level" in fields_set:
        row.experience_level = body.experience_level
    if "goals" in fields_set:
        row.goals = [g.model_dump() for g in body.goals] if body.goals is not None else None
    if "injury_notes" in fields_set:
        row.injury_notes = body.injury_notes
    if "coach_notes" in fields_set:
        row.coach_notes = body.coach_notes
    if "ai_provider" in fields_set:
        row.ai_provider = body.ai_provider

    if "ai_key" in fields_set:
        if body.ai_key is None:
            row.ai_key_encrypted = None
        else:
            row.ai_key_encrypted = crypto.encrypt(body.ai_key)

    if "strava_sync_start_date" in fields_set:
        row.strava_sync_start_date = body.strava_sync_start_date

    for field in (
        "health_metric_resting_hr",
        "health_metric_hrv",
        "health_metric_weight",
        "health_metric_sleep",
        "health_metric_vo2_max",
        "health_metric_active_energy",
    ):
        if field in fields_set:
            setattr(row, field, getattr(body, field))

    await db.commit()
    await db.refresh(row)
    return _row_to_out(row)
