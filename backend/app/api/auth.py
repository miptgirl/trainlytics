from datetime import timedelta

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel

from app.auth import authenticate_user, create_token, decode_token
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_COOKIE = "refresh_token"


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, response: Response) -> TokenResponse:
    if not authenticate_user(body.username, body.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_token(
        {"sub": body.username},
        timedelta(minutes=settings.access_token_expire_minutes),
    )
    refresh_token = create_token(
        {"sub": body.username, "type": "refresh"},
        timedelta(days=settings.refresh_token_expire_days),
    )
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
    )
    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    refresh_token: str | None = Cookie(default=None, alias=_REFRESH_COOKIE),
) -> TokenResponse:
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    username = decode_token(refresh_token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    access_token = create_token(
        {"sub": username},
        timedelta(minutes=settings.access_token_expire_minutes),
    )
    return TokenResponse(access_token=access_token)


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie(key=_REFRESH_COOKIE)
    return {"detail": "logged out"}
