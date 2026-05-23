from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://trainlytics:trainlytics@db:5432/trainlytics"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30
    # Comma-separated: "alice:$2b$...,bob:$2b$..."
    users: str = ""

    # Frontend base URL — used for OAuth redirects after callback
    frontend_url: str = "http://localhost:5173"

    # Strava OAuth — all optional; Strava features disabled when absent
    strava_client_id: str | None = None
    strava_client_secret: str | None = None
    strava_redirect_uri: str | None = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
