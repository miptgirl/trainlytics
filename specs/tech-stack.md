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
| Styling | Tailwind CSS |
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

- All analytics are computed server-side in Python — well-suited for trend calculations, aggregations, and future ML/AI integrations
- Export endpoint produces structured plain-text weekly summaries suitable for pasting into any AI tool or sharing with a coach

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

---

### Deploying to production

**Prerequisites:** A Linux server with Docker, Docker Compose, and Git installed, plus a populated `.env` file.

A convenience script at `scripts/deploy.sh` handles the full deploy lifecycle:

```bash
bash scripts/deploy.sh
```

What the script does (in order):

1. **`git pull`** — fetch and apply the latest commits from the current branch.
2. **`docker compose -f docker-compose.prod.yml up --build -d`** — rebuild images and restart all containers in detached mode.
3. **`alembic upgrade head`** — run any pending database migrations inside the running backend container.

The script exits immediately on any failure (`set -euo pipefail`). It is idempotent — safe to run on an already up-to-date deployment.

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
| Token format | JWT (access token, short-lived) + refresh token (HTTP-only cookie) |
| Password hashing | bcrypt |
| Backend library | `python-jose` (JWT) + `passlib` (bcrypt) |
| Frontend | Token stored in memory; refresh token in HTTP-only cookie |

All API routes are protected by default. The frontend redirects to login on 401. Mobile browsers access the same API — no separate mobile auth flow needed.

## Key Constraints

- Accounts are defined via environment variables — no registration UI; multiple accounts supported but managed at the infrastructure level, not through the app
- No external dependencies for core functionality (no third-party fitness APIs)
- All data stays local or on a user-controlled server
