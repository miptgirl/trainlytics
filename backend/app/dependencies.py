from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

from app.auth import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    """Returns the authenticated username or raises 401."""
    username = decode_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return username
