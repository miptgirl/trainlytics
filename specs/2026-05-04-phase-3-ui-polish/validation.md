# Phase 3 — Validation

The implementation is complete and mergeable when all of the following pass.

---

## Database Migrations

- [x] `workout_sessions.date` is a `DateTime(timezone=True)` column; all existing rows were migrated to `date + 00:00:00 UTC`
- [x] `workout_sessions.calories` column exists as a nullable integer
- [x] `workout_sessions.title` column exists as a nullable text field
- [x] `cardio_segments.title` column exists as a nullable text field
- [x] `strength_sessions.duration_seconds` column exists as a nullable integer
- [x] All Alembic migrations apply cleanly on a fresh database (`alembic upgrade head`)

---

## Backend API

- [x] `POST /sessions/cardio` accepts `datetime`, `title`, and `calories`; returns them in the response
- [x] `PATCH /sessions/cardio/{id}` accepts and persists `datetime`, `title`, `calories`
- [x] `GET /sessions/cardio/{id}` returns `datetime`, `title`, `calories`, and segment `title` fields
- [x] Same three checks pass for all strength session endpoints
- [x] `POST /sessions/strength` accepts and persists `duration_seconds`; `GET` returns it
- [x] `POST /sessions/cardio` with segment `title` persists and returns the segment title
- [x] `GET /sessions/weekly-summary?week_start=2026-05-04` returns `{ cardio: { minutes, calories }, strength: { minutes, calories } }` for the correct week
- [x] Weekly summary excludes sessions outside the Mon–Sun window
- [x] Weekly summary `calories` sums only non-null values; sessions with `calories=null` are ignored
- [x] Weekly summary returns zeros for a week with no sessions (not an error)
- [x] User A's weekly summary does not include User B's sessions — *verified by `test_weekly_summary_user_isolation`*
- [x] `GET /sessions/training-trends?weeks=12` returns 12 data points ordered chronologically, each with `week_start`, `cardio_minutes`, `strength_minutes`, `cardio_calories`, `strength_calories`
- [x] Weeks with no sessions appear as zero-value entries (not omitted)
- [x] Training trends are user-scoped — *verified by `test_training_trends_user_isolation`*
- [x] All existing session tests still pass with the updated schemas

---

## Branding & Design System

- [x] `logo.png` is displayed in the header/nav on every page
- [x] The logo is not broken on mobile viewport (responsive sizing)
- [x] **Montserrat** font is applied across the entire app (body text, headings, inputs)
- [x] Blue-accent colour palette is applied consistently to buttons, active nav links, and interactive elements
- [x] No page retains the old flat/bare look (spot-check: Login, History, Log Workout, Templates)

---

## Settings Tab

- [x] A **Settings** link appears in the main nav and navigates to `/settings`
- [x] `/settings` shows both Activity Types and Exercises management sections
- [x] Old standalone Activity Types and Exercises nav links are removed
- [x] Activity types can be created, edited, and deleted from the Settings page
- [x] Exercises can be created, edited, and deleted from the Settings page

---

## Unified Log Screen

- [x] Navigating to `/log` shows a type selector (Cardio / Strength)
- [x] Selecting Cardio renders the cardio log form inline
- [x] Selecting Strength renders the strength log form inline
- [x] Navigating to `/log?templateId=<id>` auto-selects Strength and pre-fills the template
- [x] `/log-cardio` and `/log-strength` routes no longer exist (404)
- [x] "Use this template" in the Template Library navigates to `/log?templateId=<id>`
- [x] Submitting a session from the unified screen saves correctly and redirects to history

---

## Date & Time Picker

- [x] Log forms show a date + time picker (not date-only)
- [x] When opening a new log form the picker defaults to the current local date and time
- [x] The saved session's `datetime` in the DB is in UTC
- [x] History list shows date and time per session (e.g. "4 May 2026 · 07:30")
- [x] Session detail pages show date and time

---

## Richer History Screen & Weekly Summary Card

- [x] A weekly summary card appears at the top of the History screen
- [x] The card shows cardio minutes, strength minutes, cardio calories, and strength calories for the current week
- [x] The card shows `0` (not an error) when there are no sessions that week
- [x] A **training trends chart** appears below the weekly summary card
- [x] The chart shows 12 weeks of data with cardio and strength series
- [x] A "Minutes / Calories" toggle switches the chart between the two views
- [x] Weeks with no sessions show as zero (not a gap or error in the chart)
- [x] Each session row has a visible type badge (cardio vs. strength)
- [x] Strength session rows show exercise count, total volume, and duration (when `duration_seconds` is present)
- [x] Cardio session rows show distance (km), duration (mins), and pace (min/km) where available
- [x] Session `title` is displayed in the history row when present

---

## Session & Segment Titles

- [x] Log Strength form has an optional Title field; value is saved and appears in the session detail
- [x] Log Cardio form has an optional Title field; value is saved and appears in the session detail
- [x] Each cardio segment row has an optional Title field; value is saved and appears in the segment detail
- [x] Log Strength form has an optional **Duration** field (mins); value is stored as `duration_seconds` and displayed in the session detail and history row
- [x] Editing an existing session pre-fills the title and duration field(s)

---

## Cardio Units & Calories

- [x] Cardio duration is displayed in **minutes** everywhere in the UI (not seconds)
- [x] Cardio distance is displayed in **km** everywhere in the UI (not metres)
- [x] Cardio pace is displayed in **min/km** everywhere in the UI (not seconds/km)
- [x] The backend still stores seconds, metres, and seconds-per-km — confirmed by inspecting the DB or API response directly
- [x] Log Cardio form accepts distance in km and duration in mins; values are converted before sending to the API
- [x] Log Strength form has an optional **Calories** field; value is saved and shown in session detail
- [x] Log Cardio form has an optional **Calories** field; value is saved and shown in session detail
