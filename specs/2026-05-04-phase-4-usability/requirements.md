# Phase 4 — Usability & Mobile Polish Requirements

## Scope

Make the app work smoothly on mobile, speed up daily logging flows, and simplify deployment. This phase is a mix of small backend additions (exercise types data model), frontend UX improvements, and a lightweight ops script. No existing data is broken or removed.

---

## Decisions

### Mobile Header Fix
- The top navigation bar must be fully usable on small screens (≥ 320 px wide).
- "Log Workout" and "Sign Out" must not overlap or be clipped.
- The fix must not break the desktop layout.
- Preferred approach: a hamburger / collapsible mobile menu, or a responsive flex layout that wraps cleanly — whichever fits the existing Tailwind design system with the least complexity.

### Deployment Script
- A single shell script (`scripts/deploy.sh`) that:
  1. Pulls the latest code from `main` (`git pull`).
  2. Rebuilds and restarts containers (`docker compose -f docker-compose.prod.yml up --build -d`).
  3. Applies pending Alembic migrations (`docker compose exec backend uv run alembic upgrade head`).
- Covers both initial setup and incremental updates (idempotent).
- The script lives at `scripts/deploy.sh` in the repo root.
- Usage documented in `README.md`.

### Exercise Types (user-managed tags)
- Exercise types are a user-managed list, stored in the database — identical in design to **Cardio Activity Types**.
- A new `exercise_types` table: `id`, `user_id`, `name`, `created_at`.
- An exercise can carry **zero or more** type tags. This is a many-to-many relationship via a `exercise_exercise_types` join table.
- The full CRUD API for exercise types mirrors `/cardio-types`: `GET`, `POST`, `PATCH /{id}`, `DELETE /{id}`.
- Exercise types are managed in the existing **Settings** page alongside Activity Types and Exercises.
- The exercise detail (create / edit) UI gains a multi-select tag input for types.

### Exercise Picker Grouped by Type
- When selecting an exercise in the **template editor** or the **strength log form**, exercises are grouped by their type tags.
- Exercises with no type appear in an *"Uncategorised"* group at the bottom.
- Exercises with multiple types appear in each relevant group.
- The grouping is frontend-only — the existing `GET /exercises` endpoint returns all exercises; grouping is done client-side.

### Template Form: Add Exercise at Bottom
- The "Add Exercise" button moves to the **bottom** of the exercise list in the template editor.
- No backend change required.

### Collapsible Exercises
- In both the **template editor** and the **strength log form**, each exercise block can be collapsed/expanded with a chevron toggle.
- Collapsed state: shows only the exercise name and a summary (e.g. "3 sets").
- Exercises **auto-collapse** when all their sets are marked done (strength log form only; template editor has no set-completion state).
- Collapsed/expanded state is purely client-side — never persisted.

### Green Set Completion Label
- In the strength log form, completed sets (ticked with the tick button) are highlighted in **green** instead of the current muted/grey style.
- No backend change required.

### Auto-fill Session Title
- When logging strength **from a template**, the title field defaults to the template name.
- When logging strength **without a template**, the title defaults to `"Strength session"`.
- When logging cardio, the title defaults to `"<Activity type> – <X> km"` (e.g. `"Run – 8 km"`); the value updates live as the user changes activity type or total distance.
- The default is fully editable — it is just a pre-filled value, not locked.
- No backend change required.

### Human-Readable Duration & Pace Inputs
- Duration and pace fields across **all forms** (cardio segments, cardio session total, strength session duration) accept and display values in human-readable time format:
  - Duration: `h:mm:ss` or `m:ss` (e.g. `1:05:30`, `45:00`).
  - Pace: `m:ss` per km (e.g. `5:30`).
- A shared `TimeInput` component handles parsing and formatting; it replaces plain `<input type="number">` for these fields.
- The component accepts a value in **seconds** (duration) or **seconds-per-km** (pace) as its canonical form and converts for display/entry.
- Backend storage format is unchanged (seconds, seconds-per-km).
- Validation: the component rejects non-time strings and shows an inline error.

---

## Out of Scope for Phase 4
- Unit preference (kg / lb) — deferred to a later phase.
- Template versioning — deferred.
- Any new analytics or chart work (Phase 6).
- Any planning features (Phase 5).
