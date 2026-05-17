from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/debug", tags=["debug"])


class SqlRequest(BaseModel):
    sql: str


def _to_json_safe(v: object) -> object:
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, Decimal):
        return float(v)
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return str(v)


@router.post("/sql")
async def run_sql(
    body: SqlRequest,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(text(body.sql))
        if result.returns_rows:
            columns = list(result.keys())
            rows = [[_to_json_safe(v) for v in row] for row in result.fetchmany(500)]
            rowcount = len(rows)
        else:
            columns = []
            rows = []
            rowcount = result.rowcount if result.rowcount != -1 else 0
        return {"columns": columns, "rows": rows, "rowcount": rowcount}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
