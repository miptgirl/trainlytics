# Phase 1 — Implementation Plan

Each group is a shippable unit. Complete them in order — later groups depend on earlier ones.

---

## ✅ Group 1 — Project Scaffold

1. ✅ Initialize `frontend/` with Vite 5 + React + TypeScript (pnpm)
2. ✅ Initialize `backend/` with FastAPI + uv (`pyproject.toml`, `app/` structure)
3. ✅ Write `docker-compose.yml` with three services: `db` (postgres:16), `backend`, `frontend`
4. ✅ Configure `backend` to connect to PostgreSQL via `DATABASE_URL` env var
5. ✅ Run Alembic init; env.py wired to async SQLAlchemy + model metadata
6. ✅ Add `docker-compose.prod.yml` override (no volume mounts, pinned images)
7. ✅ `docker compose up --build` verified: all three containers start, `GET /api/health` returns `{"status":"ok"}` through the nginx proxy

> **Note:** Vite pinned to v5.4 (Node 20.17 in dev is below Vite 6's 20.19+ requirement). The Docker builder image uses `node:20-slim` which pulls a compatible version.

---

## ✅ Group 2 — Auth

1. ✅ Define user loading from env var (`USERS=name:bcrypt_hash,...`)
2. ✅ Write `/auth/login` endpoint: validate credentials, return JWT access token + set refresh cookie
3. ✅ Write `/auth/refresh` endpoint: accept refresh cookie, return new access token
4. ✅ Write `/auth/logout` endpoint: clear refresh cookie
5. ✅ Write FastAPI dependency `get_current_user` — validates JWT, raises 401 if invalid
6. ✅ Apply `get_current_user` as default dependency to all routers
7. ✅ Build login page in React (username + password form, React Hook Form)
8. ✅ Store access token in memory (React state / context); on 401, redirect to `/login`
9. ✅ Wire up silent token refresh on page load using the refresh cookie

---

## ✅ Group 3 — Exercise Library

1. ✅ `Exercise` model: `id`, `user_id`, `name`, `notes`, `created_at`
2. ✅ Alembic migration for exercises table
3. ✅ CRUD endpoints: `GET /exercises`, `POST /exercises`, `PATCH /exercises/{id}`, `DELETE /exercises/{id}`
4. ✅ Frontend: Exercise Library page — list, add, edit, delete exercises

---

## Group 4 — Cardio Activity Types

1. `CardioActivityType` model: `id`, `user_id`, `name`, `created_at`
2. Alembic migration for activity types table
3. CRUD endpoints: `GET /cardio-types`, `POST /cardio-types`, `PATCH /cardio-types/{id}`, `DELETE /cardio-types/{id}`
4. Frontend: Activity Types page — list, add, edit, delete types

---

## Group 5 — Cardio Logging

1. `WorkoutSession` model: `id`, `user_id`, `type` (enum: cardio/strength), `date`, `notes`, `created_at`
2. `CardioSession` model: `id`, `session_id`, `activity_type_id`, `total_duration_seconds`
3. `CardioSegment` model: `id`, `cardio_session_id`, `order`, `duration_seconds`, `distance_meters`, `pace_seconds_per_km`, `heart_rate_avg`
4. Alembic migration for the above tables
5. `POST /sessions/cardio` — create session + segments in one transaction
6. `GET /sessions/{id}` — return full session with nested segments
7. `PATCH /sessions/{id}` and `DELETE /sessions/{id}`
8. Frontend: Log Cardio form — activity type picker, date, notes, dynamic segment list (add/remove rows)
9. Frontend: Cardio session detail view

---

## Group 6 — Strength Logging

1. `StrengthSession` model: `id`, `session_id`
2. `StrengthExerciseEntry` model: `id`, `strength_session_id`, `exercise_id`, `order`
3. `StrengthSet` model: `id`, `exercise_entry_id`, `set_number`, `reps`, `weight`, `notes`
4. Alembic migration for the above tables
5. `POST /sessions/strength` — create session + exercises + sets in one transaction
6. `GET /sessions/{id}` extended to handle strength session shape
7. `PATCH /sessions/{id}` and `DELETE /sessions/{id}` for strength sessions
8. Frontend: Log Strength form — date, notes, dynamic exercise list (pick from library), dynamic set rows per exercise
9. Frontend: Strength session detail view

---

## Group 7 — Workout History

1. `GET /sessions` — paginated list, filters: `type` (cardio/strength), `date_from`, `date_to`
2. Frontend: History page — list of sessions with date, type, and summary metric
3. Filter controls: type selector, date range picker
4. Link each row to its detail view
