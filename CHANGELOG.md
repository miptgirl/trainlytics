# Changelog

All notable changes to Trainlytics are documented here.

---

## 2026-05-17 — Phase 14: Plan vs. Actual Deep Analytics

### Added

- **Template versioning** — every template create/update snapshots the full exercise+set structure into three history tables (`strength_template_history`, `strength_template_history_exercises`, `strength_template_history_sets`); `strength_templates.current_version` tracks the latest version number; `planned_sessions.template_version` records which snapshot the planned session was built against; Alembic migration 0013
- **Comparison endpoint** — `GET /api/plan/sessions/{id}/comparison` returns a per-exercise diff between the planned template snapshot (at `template_version`) and the matched logged session; response includes planned/actual sets, reps, weight, and volume per exercise; `source` field marks exercises as `planned_only`, `actual_only`, or `both`; 404 returned when `template_version` is null and no snapshot exists
- **SessionComparisonPanel** — collapsible panel on "Done" plan cards; strength view shows per-exercise table with Planned / Actual columns, Diff % column (green >+1%, red <-1%, neutral otherwise), and set-count + volume summary ("3 sets · 660 kg"); cardio view shows distance, duration, and avg pace; totals section shows total volume and total exercises rows; shared `StrengthCols` colgroup keeps all exercise tables pixel-aligned with `table-fixed`
- **Backfill migration** — Alembic migration 0014 backfills `template_version` on pre-Phase-14 planned sessions by joining to `strength_templates.current_version`; downgrade is a no-op

### Changed

- **Strength session matching** — `_compute_status` (plans.py) and weekly summary + comparison matching (plan_summary.py) now use `or_(StrengthSession.template_id == …, StrengthSession.template_id.is_(None))` so sessions logged without a template link still count as done
- **Cardio duration fallback** — weekly summary actual cardio duration falls back to summing segment `duration_seconds` when `CardioSession.total_duration_seconds` is null
- **Debug SQL enabled** — `DEBUG_SQL_ENABLED=true` added to both `docker-compose.yml` and `docker-compose.prod.yml`; gates the `/api/debug/sql` endpoint for ad-hoc SQL inspection in profile

### Tests

- **3 template versioning tests** in `test_templates.py` — version 1 history written on create, version incremented on update, original history row unchanged after update
- **4 plan versioning tests** in `test_plans.py` — `template_version` stored on plan session create, unchanged on edit with same template, updated on edit with new template, preserved across copy-from-last-week
- **8 comparison tests** in `test_plan_comparison.py` (new file) — strength happy path, cardio happy path, exercises with null weight excluded, planned-only / actual-only exercises, mismatched template returns empty, no matched session returns 404, null `template_version` returns 404

---

## 2026-05-17 — Phase 12: Analytics Fixes & Navigation Revamp

### Added

- **Stats tab** — `/history` and `/analytics` merged into a single `/stats` route with an inline sub-nav (Analytics | History); Analytics is the default sub-tab; `/history` and `/analytics` redirect to the appropriate `?tab=` URL; `StatsPage.tsx` wraps both pages
- **Overview trends charts** — three new week-by-week bar charts visible by default above the Strength section: Sessions per Week, Total Training Time per Week, and Total Volume per Week; backed by `GET /analytics/overview-trends` returning `{week_start, session_count, total_minutes, total_volume}` for the last 12 weeks
- **Weekly Exercises by Type chart** — stacked bar chart of exercise *count* (not volume) per muscle-group tag per week, last 12 weeks; visible by default in the Strength section alongside the existing Volume by Type chart; backed by `GET /analytics/strength/exercises-by-type`
- **Plan vs. Actual card on Plan tab** — `PlanVsActualCard` component below the weekly overview; shows planned vs. actual distance (km) and duration (min) for cardio, and planned vs. actual exercise count and volume (kg·reps) for strength; backed by `GET /plan/weekly-summary?week_start=YYYY-MM-DD`
- **Plan Adherence chart in Analytics** — rolling 12-week stacked bar chart (visible by default at bottom of Analytics sub-tab) showing completion % and signed volume/distance delta per week; backed by `GET /analytics/plan-adherence?weeks=12`
- **Per-chart SQL debug viewer** — small `</>` icon in each analytics chart header; clicking it re-fetches the endpoint with `?debug=true` and displays the rendered SQL in `SqlDebugModal` with monospace formatting and horizontal scroll; all analytics endpoints support `?debug=true` wrapping the normal payload in `{ "data": [...], "debug": { "sql": "..." } }`
- **Profile: SQL executor** — new collapsible SQL sub-section in the Debug panel at the bottom of the Profile page; textarea + Run button; results rendered as a scrollable table; errors shown inline; backed by `POST /debug/sql` returning `{columns, rows, rowcount}` (capped at 500 rows); route registered only when `DEBUG_SQL_ENABLED=true` env var is set (404 otherwise)
- **Alembic migration 0011** — API key simplification: adds `ai_provider` (string, nullable) and `ai_key_encrypted` (string, nullable) to `user_settings`; drops separate Anthropic/OpenAI encrypted columns; wipes both old key columns on deploy

### Changed

- **Analytics bug fixes** — fixed three broken Phase 10 SQL queries: Activity Type Split (was returning no rows), Walk Segments per Session (was returning all-zero counts), and Distance Progression (was returning no distance data); queries now use `session`-level `activity_type_id` consistently
- **Analytics UX layout** — Consistency heatmap moved to immediately below the all-time summary header; Strength section shows Weekly Volume by Type and Weekly Exercises by Type visible by default, all other strength charts collapsed; Cardio section collapsed by default
- **Profile: API key simplification** — single provider selector (Anthropic | OpenAI) + one masked key field replaces the previous separate Anthropic/OpenAI fields; `PATCH /profile` accepts `{ai_provider, ai_key}`; `GET /profile` returns `{ai_provider, ai_key_configured: bool}`; migration wipes both previous keys on deploy

### Tests

- **Analytics bug-fix tests** — `test_cardio_time_split_uses_session_activity_type`, `test_cardio_walk_segments_uses_session_activity_type`, `test_cardio_distance_progression_uses_session_activity_type`
- **Analytics debug flag tests** — `test_analytics_debug_flag`, `test_analytics_debug_false_returns_normal_shape`
- **New analytics endpoint tests** — `test_overview_trends`, `test_exercises_by_type`, `test_plan_adherence`
- **Debug SQL tests** in `test_debug.py` — `test_debug_sql_disabled_returns_404`, `test_debug_sql_select`, `test_debug_sql_invalid`
- **Profile key tests** in `test_profile.py` — `test_patch_ai_key`, `test_patch_ai_key_openai`, `test_patch_ai_provider_invalid`, `test_raw_key_not_returned_in_get`, `test_clear_ai_key`, `test_patch_ai_provider`, `test_migration_wipes_keys`
- **`StatsPage.test.tsx`** — 4 Vitest tests: renders Analytics sub-tab by default, renders History sub-tab on `?tab=history`, shows both sub-tab buttons, switches tabs on click
- **`PlanVsActualCard.test.tsx`** — 4 Vitest tests: planned/actual cardio distance, planned/actual strength volume, renders nothing without data, uses provided `weekStart` in API request

---

## 2026-05-17 — Phase 13: Heart Rate Zones

### Added

- **HR data on cardio sessions** — six new columns on `workout_sessions`: `avg_hr_bpm INTEGER NULL` and `z1_seconds`–`z5_seconds INTEGER NULL`; Alembic migration 0012 also drops the unused `cardio_segments.heart_rate_avg` column
- **HR zone constants** — `backend/app/services/hr_zones.py` defines the five fixed Apple Health BPM thresholds (Z1 < 132, Z2 133–144, Z3 145–157, Z4 158–169, Z5 ≥ 170)
- **Cardio log form: HR input section** — collapsible "Add HR data" toggle below the last segment; expands to reveal an avg HR integer field and five zone duration inputs (Z1–Z5 with BPM range labels) using the existing `h:mm:ss` / `m:ss` parser; collapsed by default, auto-expanded when editing a session with saved HR data; HR fields included in `localStorage` draft and restored on draft load
- **Session detail: HR zone donut** — new `HrZoneDonut` component renders a Recharts donut chart when at least one zone field is non-null and non-zero; only zones with data appear as slices; per-slice tooltip shows zone label, BPM range, formatted duration (`h:mm:ss`), and % of total; "Avg HR: {n} bpm" stat shown above the chart when present; section hidden entirely when no HR data exists; absent on strength sessions
- **History list: avg HR badge** — heart icon + "{n} bpm" rendered alongside distance/pace/duration chips for cardio sessions where `avg_hr_bpm` is set; absent for sessions without HR or for strength sessions
- **Analytics: HR Zone Trends chart** — new `HrZoneTrendsChart` component added as the first item inside the Cardio collapsible section; stacked bar chart with one bar per week; Minutes / % toggle (absolute zone minutes vs. normalized 100% bars); Z1–Z5 colors consistent with the session detail donut; per-bar tooltip shows all five zones with minutes and %; SQL debug `</>` icon
- **`GET /analytics/cardio/hr-zone-trends`** — returns `[{week_start, z1_minutes, …, z5_minutes}]` for the last 12 complete Mon–Sun weeks plus the current in-progress week (13 entries); null zone seconds treated as 0; `?debug=true` wraps response in `{data, debug: {sql}}`

### Removed

- `cardio_segments.heart_rate_avg` column — dropped by migration 0012; was never surfaced in the UI; submitting `heart_rate_avg` in a segment payload is now silently ignored

### Tests

- **5 session API tests** — `test_log_cardio_with_hr_data`, `test_log_cardio_no_hr_data`, `test_session_list_includes_avg_hr`, `test_session_list_no_hr_null`, `test_segment_heart_rate_avg_removed`
- **3 analytics tests** — `test_hr_zone_trends_aggregation`, `test_hr_zone_trends_null_zones_as_zero`, `test_hr_zone_trends_debug_flag`
- Existing `CARDIO_PAYLOAD` in `test_sessions.py` updated to remove the now-gone `heart_rate_avg` segment field

---

## 2026-05-17 — Phase 11: Planning & Weekly Overview

### Added

- **Plan Tab** — new `/plan` route in the nav bar (between History and Analytics); week header shows the Mon–Sun date range with `←` / `→` navigation
- **Weekly Plan Model** — three new tables: `weekly_plans`, `planned_sessions`, `planned_cardio_segments`; auto-created on first `GET /plans/{week_start}`; `week_start` must be a Monday (400 otherwise)
- **Planned Session CRUD** — `POST`, `PUT`, `DELETE` for planned sessions; strength sessions require a template (title auto-filled from template name); cardio sessions require an activity type and at least one segment with distance/duration/pace
- **Status Tracking** — each planned session computes `planned` / `done` / `skipped` at query time: matched to a logged session by template (strength) or activity type (cardio); past unmatched sessions flip to `skipped`
- **Skip Notes** — `PATCH /plans/{week_start}/sessions/{id}/skip-note`; "Add note" / "Edit note" inline on Skipped cards; note cleared on copy-from-last-week
- **Weekly Overview Card** — top-of-page summary showing Planned / Done / Skipped counts and a completion % bar (Done ÷ (Done + Skipped), Planned sessions excluded)
- **Copy from Last Week** — one-tap cloning of all sessions +7 days; skip notes stripped; returns 409 if the target week already has sessions
- **Start Session from Plan** — "Start" button on today's Planned cards pre-fills the log form: strength opens `/log?type=strength&templateId=…`; cardio opens `/log?type=cardio&plannedSessionId=…` with segments pre-filled
- **Reschedule** — modal shows Mon–Sun day picker with past days disabled; moves the session within the week
- **Swap / Edit** — Skipped cards show "Swap" (opens plan form pre-filled with existing content); Planned cards show "Edit"; inline delete with confirmation prompt
- **AI Cardio Adapt Modal** — "Adapt this session" button appears in the cardio log form when the logged activity type matches a today-planned session; sends planned session + cardio history to the AI; suggestions rendered as markdown
- **Smart cardio card titles** — when no explicit title is set, auto-generates "Run – 8 km" or "Run – 45 min" from aggregated segment distance / duration

### Changed

- **Activity type structure** — `activity_type_id` moved from `planned_cardio_segments` to `planned_sessions` (session-level, matching the logging model); cardio matching simplified to `CardioSession.activity_type_id`; AI service updated accordingly; Alembic migration applied
- **Timezone-safe date helpers** — `toLocalDateStr(d: Date)` added to `dateUtils.ts`; replaces all `toISOString().split('T')[0]` calls in `PlanPage`, `WeekGrid`, `PlanSessionForm`, `RescheduleModal`, `LogWorkoutPage`, and `HistoryPage` (those calls returned the UTC date, causing the grid to show Sunday instead of Monday for UTC+ users)

### Tests

- 25 backend tests in `tests/test_plans.py` and `tests/test_ai_cardio_adapt.py` covering all CRUD paths, status transitions, skip-note set/clear, copy-from-last-week, conflict detection, and AI adapt 402/404/happy-path

---

## 2026-05-16 — Phase 10: Deep Analytics

### Added

- **Analytics Tab** — new `/analytics` route added to the nav bar; full-page analytics experience with five sections: All-time Summary, Strength, Cardio, Readiness, Consistency
- **11 backend analytics endpoints** under `/api/analytics/`:
  - `strength-progression` — volume and 1RM trend per exercise over time
  - `personal-records` — best set (weight × reps) per exercise, all-time
  - `volume-by-tag` — weekly strength volume broken down by exercise type tag
  - `cardio-time-split` — share of cardio time by activity type (pie)
  - `walk-segments` — walking distance/duration trend over time
  - `distance-progression` — weekly distance per activity type
  - `training-load` — 4-week vs 8-week rolling weekly volume comparison
  - `readiness-trends` — weekly average wellbeing and RPE
  - `wellbeing-correlation` — scatter of wellbeing vs session count per week
  - `consistency-heatmap` — daily training activity grid (GitHub-style)
  - `all-time-summary` — lifetime totals (sessions, distance, volume, PRs)
- **11 Recharts frontend components** — one per endpoint, each with loading skeleton, empty state, and responsive container; composed into `AnalyticsPage.tsx`
- **`skip_empty_weeks` param** — added to `GET /sessions/training-trends`; History screen updated to use it so gaps in data don't break the chart x-axis

### Tests

- 54 backend tests in `tests/test_analytics.py` and `tests/test_sessions.py` covering all new endpoints, edge cases, and empty-state responses

---

## 2026-05-16 — Phase 9: AI Training Coach

### Added

- **User Profile Page** — `/profile` route linked from nav bar; stores display name, birth year, experience level, training goals (ordered list with `high`/`medium`/`low` priority), injury notes, and AI coach notes in a new `user_settings` table; all fields persist on reload
- **API Key Management** — Anthropic and OpenAI keys stored encrypted (Fernet + PBKDF2-HMAC-SHA256 from `SECRET_KEY`) in `user_settings`; masked input with toggle-reveal, "Save" (shows "Configured ✓") and "Remove" actions; provider selector shown when both keys are set; raw keys never returned to the frontend
- **Weekly Insights Panel** — "AI Insights" card on the History screen (below weekly summary, above trends chart); "Analyse this week" button calls `POST /ai/weekly-insights`; streams compacted 6-week training history with athlete context block to Claude Sonnet or GPT-4o; spinner, success, error and retry states
- **Adaptive Session Helper** — "Adapt this session" button in the strength log form opens `AdaptSessionModal`; user describes a physical complaint; `POST /ai/adapt-session` sends session snapshot + 4-week history + athlete context; suggestions rendered as plain text
- **AI Request Logging** — every AI call (success or failure) writes a row to `ai_request_logs` with endpoint, provider, model, full prompt, response, token counts, duration, and error; log write failures are silently swallowed and never propagate
- **Athlete Context Block** — assembled from profile fields (experience, age derived from birth year, goals sorted by priority, injury notes, coach notes); prepended to every AI prompt; fields omitted when not set
- **`compact_sets` / `compact_cardio_segments`** — helpers collapse consecutive identical sets/segments into `N×reps@weight` / `N×dist@pace` notation for concise prompts
- **`app/services/crypto.py`** — Fernet encrypt/decrypt with key derived from `SECRET_KEY` via PBKDF2-HMAC-SHA256 and a fixed app salt
- **Alembic migrations** — `user_settings` and `ai_request_logs` tables

### Tests

- `tests/test_ai.py` — 17 tests: `compact_sets` and `compact_cardio_segments` unit tests (empty, single, identical, mixed cases); 402 paths for both AI endpoints; happy-path Anthropic mock; log row verification for success and failure; SDK exception writes log row with `error` set and does not re-raise
- `WeeklyInsightsCard.test.tsx` — 6 Vitest tests: no-key state, Analyse button, spinner, result render, error state, retry
- `AdaptSessionModal.test.tsx` — 9 Vitest tests: renders, no-key state, disabled button when empty, enabled when typed, spinner, suggestions render, request body, error state, close

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
