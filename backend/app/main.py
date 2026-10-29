import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api import ai as ai_module
from app.api import analytics as analytics_module
from app.api import auth as auth_module
from app.api import cardio_types as cardio_types_module
from app.api import exercise_types as exercise_types_module
from app.api import exercises as exercises_module
from app.api import plan_summary as plan_summary_module
from app.api import plans as plans_module
from app.api import profile as profile_module
from app.api import sessions as sessions_module
from app.api import steps as steps_module
from app.api import apple_health as apple_health_module
from app.api import imports as imports_module
from app.api import strava as strava_module
from app.api import templates as templates_module

logger = logging.getLogger("trainlytics")

_DEFAULT_SECRET_KEY = "change-me-in-production"
if settings.secret_key == _DEFAULT_SECRET_KEY:
    # Not fatal: SECRET_KEY also derives the Fernet key for stored API keys,
    # so forcing a change would break existing deployments.
    logger.warning(
        "SECRET_KEY is the built-in default - anyone can forge login tokens. "
        "Set SECRET_KEY to a long random value (note: changing it invalidates "
        "stored encrypted API keys, which must then be re-entered)."
    )

app = FastAPI(title="Trainlytics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_module.router, prefix="/api")
app.include_router(analytics_module.router, prefix="/api")
app.include_router(exercises_module.router, prefix="/api")
app.include_router(exercise_types_module.router, prefix="/api")
app.include_router(cardio_types_module.router, prefix="/api")
app.include_router(sessions_module.router, prefix="/api")
app.include_router(steps_module.router, prefix="/api")
app.include_router(templates_module.router, prefix="/api")
app.include_router(plan_summary_module.router, prefix="/api")
app.include_router(plans_module.router, prefix="/api")
app.include_router(profile_module.router, prefix="/api")
app.include_router(apple_health_module.router, prefix="/api")
app.include_router(imports_module.router, prefix="/api")
app.include_router(strava_module.router, prefix="/api")
app.include_router(ai_module.router, prefix="/api")


def mount_debug_sql(target: FastAPI) -> None:
    """Mount POST /api/debug/sql only where settings.debug_sql_available allows it."""
    if settings.debug_sql_available:
        from app.api import debug as debug_module

        target.include_router(debug_module.router, prefix="/api")
    elif settings.debug_sql_enabled:
        logger.warning(
            "DEBUG_SQL_ENABLED is ignored: the SQL executor runs only on the local dev "
            "stack (DEMO_USER_ENABLED=true)."
        )


mount_debug_sql(app)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
