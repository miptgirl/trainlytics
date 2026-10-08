# Tech Stack

## Overview

Trainlytics is built as a single-user personal app with a React frontend and a Python FastAPI backend. The stack is chosen for developer productivity, strong analytics capability, and clean separation between UI and data logic.

## Frontend

| Concern | Choice |
|---|---|
| Framework | React (Vite) |
| Language | TypeScript |
| Routing | React Router v6 |
| State management | React Query (server state) + React built-in state for UI |
| Styling | Tailwind CSS; colours, shadows and radii in [design-system.md](design-system.md) |
| Charts | Recharts |
| Forms | React Hook Form |

## Backend

| Concern | Choice |
|---|---|
| Framework | FastAPI |
| Language | Python 3.12+ |
| ORM | SQLAlchemy 2.x (async) |
| Migrations | Alembic |
| Validation | Pydantic v2 |
| Database | PostgreSQL 16 |

## Data & Analytics

- All analytics are computed server-side in Python — well-suited for trend calculations, aggregations, and AI integrations
- Export endpoint produces structured plain-text session summaries suitable for pasting into any AI tool or sharing with a coach

## AI

| Concern | Choice |
|---|---|
| Provider | Anthropic (Claude API) |
| SDK | `anthropic` Python SDK |
| Model | Claude Sonnet (quality/cost balance) |
| Key storage | Encrypted in `user_settings` DB table; set via the in-app Profile page; never returned to the frontend after saving |
| Cost control | Prompt caching applied to the static training history block on every AI call |

AI features live entirely in the backend (`app/api/ai.py`, `app/services/ai_service.py`). The frontend never holds or transmits the API key. Two endpoints are exposed:

- `POST /ai/weekly-insights` — compares the current week against the previous 5 weeks and returns a plain-text analysis
- `POST /ai/adapt-session` — takes a planned session (template or in-progress log) and the user's free-text description of how they feel; returns concrete modification suggestions (swaps, volume cuts, exercises to skip)

## Deployment

All services run as Docker containers, orchestrated with Docker Compose for both local development and production.

| Service | Image |
|---|---|
| Frontend | nginx (serving built React app) |
| Backend | python:3.12-slim |
| Database | postgres:16 |

A single `docker-compose.yml` at the repo root covers local dev (with volume mounts for hot reload). A `docker-compose.prod.yml` override locks versions and disables dev tooling.

### Running locally

**Prerequisites:** Docker and Docker Compose installed.

**1. Create a `.env` file** in the repo root:

```
SECRET_KEY=<a long random string>
USERS=<username>:<bcrypt_hash>
```

To generate a bcrypt hash for a password, run:

```bash
docker compose run --rm backend uv run python -c \
  "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt()).decode())"
```

Example `.env`:
```
SECRET_KEY=super-secret-dev-key-change-in-production
USERS=alice:$2b$12$...
```

Multiple accounts are supported — separate them with commas:
```
USERS=alice:$2b$12$...,bob:$2b$12$...
```

**2. Start all containers:**

```bash
docker compose up --build
```

**3. Run database migrations** (only needed on first start or after schema changes):

```bash
docker compose exec backend uv run alembic upgrade head
```

**4. Open the app** at [http://localhost:5173](http://localhost:5173) and log in with the credentials from your `.env`.

**5. (Optional) Seed the demo user** — a shared account with 12 weeks of realistic data, for reviewing UI changes against the same dataset as every other developer:

```bash
bash scripts/seed-demo.sh
```

Then log in as **`demo` / `demo`**. The script runs migrations, deletes all of `demo`'s data and reseeds it. Values are deterministic and dates are anchored to the current week, so rerun it whenever you want a clean, up-to-date baseline. With Podman, use `COMPOSE="podman compose" bash scripts/seed-demo.sh`.

The demo login only works when `DEMO_USER_ENABLED=true`. `docker-compose.yml` sets it for local dev; `docker-compose.prod.yml` forces it to `false`, and the seeder refuses to run without it. Details: `specs/2026-10-04-dev-demo-user/`.

---

### Deploying to production

**Prerequisites:** A Linux server with Docker, Docker Compose, and Git installed, plus a populated `.env` file.

A convenience script at `scripts/deploy.sh` handles the full deploy lifecycle:

```bash
bash scripts/deploy.sh
```

What the script does (in order):

1. **`git pull`** — fetch and apply the latest commits from the current branch, then re-exec the script once (`--after-pull`) so a changed `deploy.sh` applies to this deploy.
2. **`docker compose -f docker-compose.prod.yml build --pull`** — rebuild the images, pulling fresh base images.
3. **`rm -sf backend`** — remove the running backend, so nothing serves requests during migrations (and `restart: always` can't revive the old container if the host reboots mid-deploy).
4. **`run --rm backend uv run alembic upgrade head`** — run pending migrations in a one-off backend container (same env and db dependency as the service).
5. **`up -d`** — start all containers in detached mode.

The API is down between steps 3 and 5. The script exits immediately on any failure (`set -euo pipefail`); a failed migration leaves the backend down on purpose. It is idempotent — safe to run on an already up-to-date deployment.

---

> **Note:** The `.env` file is gitignored. Never commit real credentials.

## Tooling

| Concern | Choice |
|---|---|
| Package manager (frontend) | pnpm |
| Package manager (backend) | uv |
| Linting/formatting (frontend) | ESLint + Prettier |
| Linting/formatting (backend) | Ruff |
| Testing (frontend) | Vitest + React Testing Library |
| Testing (backend) | pytest + httpx |

## Project Structure

```
trainlytics/
├── frontend/          # React app (Vite)
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── backend/           # FastAPI app
│   ├── app/
│   │   ├── api/       # Route handlers
│   │   ├── models/    # SQLAlchemy models
│   │   ├── schemas/   # Pydantic schemas
│   │   └── services/  # Business logic
│   ├── Dockerfile
│   └── pyproject.toml
├── docker-compose.yml
├── docker-compose.prod.yml
└── specs/
```

## Auth

Single-user app with username/password login. No OAuth, no magic links — just a secure credential pair protecting personal training data.

| Concern | Choice |
|---|---|
| Token format | JWT access token (60 min) + JWT refresh token (HTTP-only cookie, 7 days sliding); each carries a `type` claim and is only accepted for its own purpose |
| Password hashing | bcrypt |
| Backend library | `python-jose` (JWT) + `passlib` (bcrypt) |
| Frontend | Access token stored in memory; refresh token in HTTP-only cookie |

**Session policy**
- The access token lives 60 minutes and is held in memory only.
- The refresh token lives in an HTTP-only, `SameSite=Lax` cookie for 7 days and is reissued on every `/auth/refresh`, so the session ends 7 days after last access (sliding). Refresh also re-checks that the user still exists in `USERS`.
- On a 401 the client calls `/auth/refresh` once (shared across concurrent requests) and retries the original request once; only if that fails does it redirect to login. The page-load refresh restores the session after a reload.
- Set `COOKIE_SECURE=true` when serving over HTTPS so the refresh cookie gets the `Secure` flag.
- Tokens are stateless: logout only clears the cookie, and a stolen refresh token cannot be revoked before it expires. Accepted trade-off for a self-hosted app.
- The backend logs a warning on startup if `SECRET_KEY` is still the built-in default.

All API routes are protected by default. The frontend redirects to login when the session cannot be refreshed. Mobile browsers access the same API — no separate mobile auth flow needed.

## Key Constraints

- Accounts are defined via environment variables — no registration UI; multiple accounts supported but managed at the infrastructure level, not through the app
- The only exception is the dev demo account (`demo` / `demo`), enabled by `DEMO_USER_ENABLED=true` in local dev and always disabled in production
- No external dependencies for core functionality (no third-party fitness APIs)
- All data stays local or on a user-controlled server
