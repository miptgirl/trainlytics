from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.ai_request_log import AiRequestLog
from app.services import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


class AdaptSessionRequest(BaseModel):
    session_snapshot: dict
    user_message: str


class AdaptCardioRequest(BaseModel):
    planned_session_id: int
    complaint: str


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


@router.post("/adapt-cardio-session")
async def adapt_cardio_session(
    body: AdaptCardioRequest,
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
        response = await ai_service.call_adapt_cardio_session(
            body.planned_session_id, body.complaint, username, db
        )
    except ValueError as exc:
        if str(exc) == "not_found":
            raise HTTPException(status_code=404, detail="Planned session not found")
        raise HTTPException(status_code=502, detail=f"AI call failed: {exc}") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"AI call failed: {exc}") from exc
    return {"response": response}


@router.get("/logs")
async def get_logs(
    limit: int = Query(default=20, le=100),
    username: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Return the most recent AI request logs for the authenticated user."""
    result = await db.execute(
        select(AiRequestLog)
        .where(AiRequestLog.username == username)
        .order_by(desc(AiRequestLog.created_at))
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "endpoint": r.endpoint,
            "provider": r.provider,
            "model": r.model,
            "input_tokens": r.input_tokens,
            "output_tokens": r.output_tokens,
            "duration_ms": r.duration_ms,
            "error": r.error,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "prompt": r.prompt,
            "response": r.response,
        }
        for r in rows
    ]
