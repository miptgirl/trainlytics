# Phase 3 — UI Polish & Quality of Life Requirements

## Scope

Make the interface polished, vibrant, and pleasant enough to use every day. This phase is purely additive — no existing data model contracts are broken except for the `date → datetime` migration on sessions.

---

## Decisions

### Branding
- The Trainlytics `logo.png` (which includes the motto *"Track. Analyze. Improve"*) is displayed prominently in the header/nav on every screen.
- The logo replaces the current plain text app name.

### Colour & Visual Identity
- A cohesive blue-accent design system is applied globally via Tailwind CSS: primary shades of blue for interactive elements, consistent typography scale, and uniform spacing.
- The current flat/bare look is replaced with a modern UI: subtle shadows, rounded cards, clear visual hierarchy.
- **Montserrat** is the app-wide typeface, loaded via Google Fonts (or self-hosted). Applied as the default `font-sans` override in the Tailwind config.

### Unified Log Screen
- The separate `/log-cardio` and `/log-strength` routes are **replaced** by a single `/log` route.
- The user first picks the workout type (Cardio / Strength); the relevant form renders inline below.
- Old URLs (`/log-cardio`, `/log-strength`) are removed; any bookmarks or deep-links will break (accepted).
- The "Use this template" button in the Template Library navigates to `/log?templateId=<id>` (strength implied).

### Settings Tab
- A new `/settings` route is added to the main nav.
- It consolidates: **Manage Activity Types** (previously in its own nav item) and **Manage Exercises** (previously in its own nav item).
- Both are removed from the top-level nav; only **Settings** appears.

### Richer History Screen
- Each session row in the history list shows a type-specific stat summary:
  - **Strength:** exercise count, total volume (sum of weight × reps across all sets), and total duration (mins). Duration requires a `duration_seconds` field on `StrengthSession` (new nullable column + migration); the log form gains an optional Duration input.
  - **Cardio:** total distance (km), total duration (mins), and average pace (min/km) if available.
- Sessions are visually distinct by type (e.g. an icon or coloured badge).

### Weekly Stats Summary
- A summary card appears at the top of the History screen showing the current week (Mon–Sun).
- It displays: **total training minutes** and **total calories** split into cardio vs. strength columns.
- **Calories are computed server-side** from a `calories` field the user enters when logging a session.
- A new optional `calories` integer column is added to `workout_sessions`. Sessions without calories are excluded from the calorie total (no estimation).
- The weekly stats are returned by a new API endpoint: `GET /sessions/weekly-summary?week_start=YYYY-MM-DD`.

### Training Trends Chart
- Below the weekly summary card on the History screen, a **time-series chart** shows weekly training load over the last 12 weeks.
- The chart uses **Recharts** (already in the stack) and displays two lines or bars: cardio minutes and strength minutes per week.
- Data is returned by a new API endpoint: `GET /sessions/training-trends?weeks=12` (or a `from` / `to` date range). Each data point: `{ week_start: date, cardio_minutes: int, strength_minutes: int }`.
- Calories trend (cardio vs. strength calories per week) is shown as a second chart or toggled view on the same component — toggled via a tab/button between "Minutes" and "Calories".
- The chart is server-side aggregated in Python (consistent with the analytics strategy in `tech-stack.md`).

### Titles for Sessions and Segments
- An optional `title` text field is added to `WorkoutSession` (applies to both cardio and strength).
- An optional `title` text field is added to `CardioSegment`.
- Titles are displayed in session detail views and in the history list (when present).

### Date & Time Picker
- The `date` column on `workout_sessions` is migrated from `Date` to `DateTime(timezone=True)`.
- The UI shows a date + time picker on both cardio and strength log forms.
- **Time is required** — defaults to the current local time when a new session is opened.
- The time is stored in UTC on the backend.
- History list and detail views display the date and time.

### Cardio Units
- All cardio UI displays:
  - Duration in **minutes** (converted from stored seconds).
  - Distance in **km** (converted from stored metres).
  - Pace in **min/km** (converted from stored seconds-per-km).
- The backend continues to store in seconds, metres, and seconds-per-km — no schema change.
- Conversion is done in the frontend only.

---

## Out of Scope for Phase 3

- Unit preference (kg/lb) — deferred (originally backlogged from Phase 2).
- Template versioning — deferred (originally backlogged from Phase 2).
- Cardio templates — not planned.
- Planning / scheduling (Phase 4).
- Progress charts / analytics (Phase 5).
