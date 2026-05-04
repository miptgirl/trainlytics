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

- Single-user app — no multi-tenancy; one account, multiple devices
- No external dependencies for core functionality (no third-party fitness APIs)
- All data stays local or on a user-controlled server
