# Phase 3 — Implementation Plan

Each group is a shippable unit. Complete them in order — later groups depend on earlier ones.

---

## Group 1 — Database Migrations ✅

1. Add Alembic migration: change `workout_sessions.date` from `Date` to `DateTime(timezone=True)`; default existing rows to `date + 00:00:00 UTC`.
2. Add Alembic migration: add `calories INTEGER NULL` column to `workout_sessions`.
3. Add Alembic migration: add `title TEXT NULL` column to `workout_sessions`.
4. Add Alembic migration: add `title TEXT NULL` column to `cardio_segments`.
5. Add Alembic migration: add `duration_seconds INTEGER NULL` column to `strength_sessions`.
6. Update `WorkoutSession` SQLAlchemy model: `date → DateTime(timezone=True)`, add `calories`, add `title`.
7. Update `CardioSegment` SQLAlchemy model: add `title`.
8. Update `StrengthSession` SQLAlchemy model: add `duration_seconds`.

---

## Group 2 — Backend Schema & API Updates

1. Update `CardioSessionCreate` / `CardioSessionPatch` / `CardioSessionOut`: `date` becomes `datetime`, add `title`, add `calories`.
2. Update `StrengthSessionCreate` / `StrengthSessionPatch` / `StrengthSessionOut`: `date` becomes `datetime`, add `title`, add `calories`, add `duration_seconds`.
3. Update `CardioSegmentCreate` / `CardioSegmentPatch` / `CardioSegmentOut`: add `title`.
4. Update all session API endpoints (`POST`, `PATCH`, `GET`) to pass through the new fields.
5. Add `GET /sessions/weekly-summary?week_start=YYYY-MM-DD` endpoint:
   - Returns `{ cardio: { minutes: int, calories: int }, strength: { minutes: int, calories: int } }` for sessions whose datetime falls within the Mon–Sun week containing `week_start`.
   - `calories` sums only sessions where the field is not null.
6. Add `GET /sessions/training-trends?weeks=12` endpoint:
   - Returns an array of `{ week_start: date, cardio_minutes: int, strength_minutes: int, cardio_calories: int, strength_calories: int }` for the last N full weeks (default 12), ordered chronologically.
   - Aggregated server-side in Python using SQLAlchemy; weeks with no sessions produce zero-value entries.
7. Update tests: include `title`, `calories`, `duration_seconds`, and `datetime` in create/patch/read test cases; add tests for `weekly-summary` and `training-trends` endpoints (edge cases: empty range, null calories, cross-user isolation).

---

## Group 3 — Branding & Design System

1. Add `logo.png` to `frontend/src/assets/`.
2. Update `Layout.tsx`: replace plain app-name text in the header with the `<img>` logo.
3. Add **Montserrat** font: import from Google Fonts (or self-host) in `index.html` or `index.css`; set as the `font-sans` default in `tailwind.config.js`.
4. Define a Tailwind blue-accent theme extension in `tailwind.config.js` (primary palette: blue-500 / blue-600 / blue-700; neutral greys for backgrounds).
5. Apply the design system globally in `index.css` and refactor `Layout.tsx` for consistent nav styling (active link highlight, spacing, shadows).
6. Audit all pages and apply consistent card, button, input, and badge styles — no functional changes, visual only.

---

## Group 4 — Settings Tab

1. Add `/settings` route in `App.tsx`.
2. Create `SettingsPage.tsx`: two sections — *Activity Types* and *Exercises*; content moved from existing dedicated pages.
3. Remove standalone nav links for Activity Types and Exercises; add a single **Settings** nav entry.
4. Delete (or redirect) the old page files if they had their own routes.

---

## Group 5 — Unified Log Screen

1. Create `/log` route in `App.tsx`; accept optional `?templateId=<id>` query param.
2. Create `LogWorkoutPage.tsx`:
   - Step 1: type selector (Cardio / Strength) rendered as two large toggle buttons.
   - Step 2: the selected form renders inline (re-use `LogCardioPage` and `LogStrengthPage` form internals as sub-components, or redirect state).
   - If `?templateId` is present, auto-select Strength and pre-fill the template (mirrors current `LogStrengthPage` behaviour).
3. Remove `/log-cardio` and `/log-strength` routes from `App.tsx`.
4. Update "Use this template" navigation in `TemplatesPage.tsx` from `/log-strength?templateId=` to `/log?templateId=`.
5. Update any internal links or navigation calls pointing to the old routes.
6. Delete `LogCardioPage.tsx` and `LogStrengthPage.tsx` (or convert to pure form sub-components if shared).

---

## Group 6 — Date & Time Picker

1. Update cardio and strength log forms: replace `<input type="date">` with a date+time picker component (e.g. a native `<input type="datetime-local">` or a lightweight library consistent with the design system).
2. Default the picker value to `new Date()` (current local time) when a new session form is opened.
3. Serialise the selected datetime to ISO 8601 UTC before sending to the API.
4. Update history list and session detail pages to display date + time (formatted as e.g. "4 May 2026 · 07:30").

---

## Group 7 — Richer History Screen & Weekly Summary

1. Update `HistoryPage.tsx`:
   - Add a **weekly summary card** at the top: fetch `GET /sessions/weekly-summary?week_start=<current Monday>`, display cardio minutes, strength minutes, cardio calories, strength calories.
   - Add a **training trends chart** below the summary card: fetch `GET /sessions/training-trends?weeks=12`; render a Recharts `BarChart` or `LineChart` with two series (cardio minutes, strength minutes) over the last 12 weeks. Add a "Minutes / Calories" tab toggle to switch the chart between the minutes and calories views.
   - Add a type badge (icon + label) to each session row.
   - Add stat summaries per row:
     - Strength: exercise count, total volume (weight × reps, summed client-side), and duration (mins) — duration shown only when `duration_seconds` is present.
     - Cardio: total distance (km), duration (mins), pace (min/km).
2. Display `title` in session rows (when present, replace or augment the date as the primary label).

---

## Group 8 — Session & Segment Titles

1. Add an optional **Title** text input to the Log Strength form (maps to `WorkoutSession.title`).
2. Add an optional **Title** text input to the Log Cardio form (maps to `WorkoutSession.title`).
3. Add an optional **Title** text input to each cardio segment row (maps to `CardioSegment.title`).
4. Display titles in `StrengthSessionDetailPage.tsx` and `CardioSessionDetailPage.tsx`.
5. Pre-fill title fields when editing an existing session.

---

## Group 9 — Cardio Units & Calories Field

1. Create a `unitUtils.ts` helper in `frontend/src/lib/`: `secondsToMins`, `metresToKm`, `secPerKmToMinPerKm`, `minsToSeconds`, `kmToMetres`, `minPerKmToSecPerKm`.
2. Replace all raw cardio unit displays across `LogCardioPage` (or its successor), `CardioSessionDetailPage`, and `HistoryPage` with the helpers.
3. Add a **Calories** optional integer input to both the cardio and strength log forms.
4. Display calories in session detail views (when present).
