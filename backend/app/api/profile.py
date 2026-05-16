from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user_settings import UserSettings
from app.schemas.user_settings import UserSettingsOut, UserSettingsPatch
from app.services import crypto

router = APIRouter(prefix="/profile", tags=["profile"])


def _row_to_out(row: UserSettings | None) -> UserSettingsOut:
    if row is None:
        return UserSettingsOut()
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
        has_anthropic_key=row.anthropic_api_key_encrypted is not None,
        has_openai_key=row.openai_api_key_encrypted is not None,
        ai_provider=row.ai_provider,
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
    # Fetch existing row (or start fresh)
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

    # Key fields: presence in fields_set means intentionally sent
    if "anthropic_api_key" in fields_set:
        if body.anthropic_api_key is None:
            row.anthropic_api_key_encrypted = None
        else:
            row.anthropic_api_key_encrypted = crypto.encrypt(body.anthropic_api_key)

    if "openai_api_key" in fields_set:
        if body.openai_api_key is None:
            row.openai_api_key_encrypted = None
        else:
            row.openai_api_key_encrypted = crypto.encrypt(body.openai_api_key)

    await db.commit()
    await db.refresh(row)
    return _row_to_out(row)
