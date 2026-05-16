from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.services import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


class AdaptSessionRequest(BaseModel):
    session_snapshot: dict
    user_message: str


@router.post("/weekly-insights")
async def weekly_insights(
    username: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    provider_info = await ai_service.get_active_provider(username, db)
    if provider_info is None:
        raise HTTPException(
            status_code=402,
            detail="No AI API key configured. Add a key in your profile to use this feature.",
        )
    try:
        analysis = await ai_service.call_weekly_insights(username, db)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"AI call failed: {exc}") from exc
    return {"analysis": analysis}


@router.post("/adapt-session")
async def adapt_session(
    body: AdaptSessionRequest,
    username: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    provider_info = await ai_service.get_active_provider(username, db)
    if provider_info is None:
        raise HTTPException(
            status_code=402,
            detail="No AI API key configured. Add a key in your profile to use this feature.",
        )
    try:
        suggestions = await ai_service.call_adapt_session(
            body.session_snapshot, body.user_message, username, db
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"AI call failed: {exc}") from exc
    return {"suggestions": suggestions}
