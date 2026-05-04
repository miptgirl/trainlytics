from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth as auth_module
from app.api import cardio_types as cardio_types_module
from app.api import exercise_types as exercise_types_module
from app.api import exercises as exercises_module
from app.api import sessions as sessions_module
from app.api import templates as templates_module

app = FastAPI(title="Trainlytics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_module.router, prefix="/api")
app.include_router(exercises_module.router, prefix="/api")
app.include_router(exercise_types_module.router, prefix="/api")
app.include_router(cardio_types_module.router, prefix="/api")
app.include_router(sessions_module.router, prefix="/api")
app.include_router(templates_module.router, prefix="/api")


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
