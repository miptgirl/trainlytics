# Changelog

All notable changes to Trainlytics are documented here.

---

## 2026-05-04 — Phase 4: Usability & Mobile Polish

### Added

- **Exercise Types** — new `exercise_types` table and `exercise_exercise_types` join table (Alembic migration 0007); full CRUD API (`GET/POST/PATCH/DELETE /exercise-types`); `Exercise` model updated with many-to-many `types` relationship; `ExerciseOut` includes `types`; `ExerciseCreate`/`ExercisePatch` accept `type_ids`
- **Exercise Types Settings UI** — Exercise Types section added to the Settings page with full CRUD list, mirroring the Activity Types section
- **Shared `TimeInput` Component** — new `TimeInput.tsx` controlled input accepting `h:mm:ss` / `m:ss`, emitting seconds with inline validation; replaces all raw number inputs for duration/pace in the cardio and strength log forms; 15 Vitest unit tests
- **Exercise Picker Grouped by Type** — two-level drill-down picker in `ExerciseEntryBlock.tsx` and template editor; exercises grouped by type with exercise counts; exercises with no type fall into "Uncategorised"
- **Deployment Script** — `scripts/deploy.sh` automates `git pull` → `docker compose up --build -d` → `alembic upgrade head`; README and tech-stack docs updated with a Deployment section

### Changed

- **Mobile Header** — `Layout.tsx` now collapses nav links behind a hamburger menu on mobile (< `md` breakpoint); desktop layout unchanged
- **Template & Log Form UX** — "Add Exercise" button moved below the last exercise block; chevron toggle collapses/expands each exercise block in both the template editor and strength log form; in the strength log, exercises auto-collapse when all sets are marked done
- **Strength Log UX** — completed sets highlighted in green; session title pre-filled with template name (or "Strength session" for free-form logging) and suppressed once the user manually edits the field
- **Cardio Auto-fill Title** — session title auto-populated as `<Activity type> – <X> km` on mount and updated live as activity type or distance changes; `titleTouched` flag prevents overwriting manual edits

---

## 2026-05-04 — Phase 3: UI Polish

### Added

- **Branding & Design System** — logo, Montserrat font, blue-accent Tailwind palette, consistent card/button/input styles across all pages
- **Settings Page** — unified `/settings` route consolidating Activity Types and Exercises management into a single tabbed page
- **Unified Log Screen** — `/log` route with Cardio/Strength type selector and `?templateId` query-param support for launching from a template
- **Date & Time Picker** — `datetime-local` input on all log forms; UTC serialisation in the API; formatted display in history and detail pages
- **Richer History Screen** — weekly summary card, 12-week stacked-area training trends chart (Recharts), workout-type badges, and per-row stats
- **Session & Segment Titles** — optional title fields on cardio and strength log forms; displayed in detail pages
- **Cardio Units & Calories** — `unitUtils.ts` helpers for pace/distance display; calories fields on both cardio and strength log forms
- **Backend Analytics Endpoints** — `GET /sessions/weekly-summary` and `GET /sessions/training-trends`; new `datetime`, `calories`, and `title` columns on sessions/segments; `duration_seconds` on strength sessions (Alembic migration 0006)

---

## 2026-05-04 — Phase 2: Strength Templates

### Added

- **Template Data Model** — `StrengthTemplate`, `StrengthTemplateExercise`, and `StrengthTemplateSet` tables mirroring the session shape; Alembic migrations 0004–0005
- **Template CRUD API** — full `GET/POST/PATCH/DELETE /templates` endpoints with transactional create/update
- **Template Library UI** — dedicated page listing all user templates with exercise count; Edit, Delete, and Use actions per template
- **Log from Template** — strength log form pre-filled from a selected template via "Start from template" selector or "Use this template" button in the library; pre-filled forms remain fully editable
- **Set Completion Tracking** — "Done" toggle per set row when logging from a template; completed sets visually distinguished; UI-only state (not persisted)
- **Change Detection on Commit** — on submit, if the session was started from a template, diffs the submitted data against the template; shows a summary of changes and prompts the user to optionally update the template

---

## 2026-05-04 — Phase 1 MVP

### Added

- **Infrastructure** — Vite 5 + React + TypeScript frontend, FastAPI + uv backend, PostgreSQL 16, Nginx reverse proxy, Docker Compose (dev + prod), Alembic migrations
- **Auth** — credential-based login via `USERS` env var (bcrypt), JWT access token + HTTP-only refresh cookie, silent refresh on page load, global `get_current_user` dependency, login page with redirect on 401
- **Exercise Library** — full CRUD API and frontend page for managing personal exercises
- **Cardio Activity Types** — full CRUD API and frontend page for managing activity types (e.g. Running, Cycling)
- **Cardio Logging** — multi-segment cardio sessions (duration, distance, pace, heart rate per segment); transactional `POST /sessions/cardio`, full edit/delete, log form and detail view
- **Strength Logging** — multi-exercise strength sessions with sets × reps × weight; transactional `POST /sessions/strength`, full edit/delete, log form and detail view
- **Workout History** — paginated `GET /sessions` with type and date-range filters; history page with session list linking to detail views
