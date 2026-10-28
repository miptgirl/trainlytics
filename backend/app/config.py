from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://trainlytics:trainlytics@db:5432/trainlytics"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    # Set true when served over HTTPS so the refresh cookie gets the Secure flag
    cookie_secure: bool = False
    # Comma-separated: "alice:$2b$...,bob:$2b$..."
    users: str = ""
    # Local-dev only: enables the built-in demo/demo login (see app/demo).
    # docker-compose.prod.yml forces this to "false".
    demo_user_enabled: bool = False
    # Local-dev only: POST /api/debug/sql runs any SQL, writes included. Takes effect
    # only together with DEMO_USER_ENABLED; see debug_sql_available.
    debug_sql_enabled: bool = False

    # Frontend base URL — used for OAuth redirects after callback
    frontend_url: str = "http://localhost:5173"

    # Strava OAuth — all optional; Strava features disabled when absent
    strava_client_id: str | None = None
    strava_client_secret: str | None = None
    strava_redirect_uri: str | None = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def debug_sql_available(self) -> bool:
        """Whether POST /api/debug/sql is mounted (and the Profile page offers it).

        There is no production flag. DEMO_USER_ENABLED=true is what marks the local dev
        stack: docker-compose.yml sets it, docker-compose.prod.yml forces it to "false"
        through `environment:`, which a .env line can't override. Requiring it here means
        a DEBUG_SQL_ENABLED=true that reaches production does nothing.
        """
        return self.debug_sql_enabled and self.demo_user_enabled


settings = Settings()
