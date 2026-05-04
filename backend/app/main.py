from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth as auth_module
from app.api import exercises as exercises_module

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


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
