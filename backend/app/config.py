from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://trainlytics:trainlytics@db:5432/trainlytics"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    # Comma-separated: "alice:$2b$...,bob:$2b$..."
    users: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
