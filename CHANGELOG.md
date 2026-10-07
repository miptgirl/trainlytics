# Changelog

All notable changes to Trainlytics are documented here.

---

## 2026-10-07 — Session RPE on 1–10

### Changed

- **Session RPE uses the standard 1–10 scale** (10 = maximal effort) instead of the inverted 1–5 one (1 = All-out). Migration `c3f8e1a2b9d4` converts existing rows (`new = 12 − 2 × old`: All-out 1 → 10 … Very easy 5 → 2). The five emoji pickers now read easy → hard and save 2/4/6/8/10; odd values display as the nearest option. The text export shows `Effort: 😐 Moderate (6/10)`, Stats glance `/10`, the readiness chart plots RPE on its own 0–10 axis, and the AI context labels it `session RPE=6/10`. Strength and cardio drafts saved under the old scale drop their session RPE on load
- `scripts/deploy.sh` runs migrations with the backend down (pull → re-exec the updated script → build → remove backend → migrate → up), so new code never writes rows a pending migration rewrites. The API is briefly down during a deploy
- Session create and PATCH refuse a non-null session `rpe` without `X-Session-Rpe-Scale: 10` (409, "The app was updated. Reload the page and set effort again"), so a tab or PWA loaded before this release can't save an old-scale value; the frontend sends the header on every request
- nginx resolves the backend per request (10s cache) instead of once at start, so recreating the backend container no longer causes 502s until the frontend restarts
- The production db healthcheck probes every 2s while starting, so a cold start doesn't delay the deploy's migration step by a full 60s interval

### Fixed

- A set RPE that would not be saved (e.g. from a stored draft) now blocks the save with a message naming the exercise and set, on the log page (including collapsed exercises), the session edit page and workout mode's Finish. Before, it was sent as `null` and lost
- API validation errors read as text with their location (`exercise 1 › set 2 › rpe: …`) instead of `[object Object]`; the session edit page now shows a failed save
- `PATCH /sessions/{id}` returns 422 for an invalid body instead of 500

### Deploy notes

- Run `git pull` before `bash scripts/deploy.sh` for this release: servers still have the old script, which starts the new backend before migrating
- Hard-refresh open browser tabs after deploying: the old bundle crashes on session RPE values 6–10, and its saves with a session RPE are refused (409) until reloaded

---

## 2026-10-05 — Sage palette and Stats glance (Phase 17, part 4)

### Added

- **Stats glance** — at the top of the Analytics tab below 768px: this week (sessions done of planned, training time, cardio km), the latest personal record, 12 weeks of training time as small bars, and average feeling and effort over the last 7 days. It uses existing analytics endpoints only. The records endpoint has no date, so the PR date comes from each exercise's progression series (the first day its max weight reached the record weight). It looks at the first 30 exercises and skips bodyweight records, so "latest" is approximate for more than 30 exercises until the records endpoint returns dates; it renders as soon as one progression resolves and caches them for 5 minutes. The cards only mount (and fetch) below 768px. "Cardio" is the distance of all cardio sessions this week (planned or not, walks and rides included), and the 12-week average excludes the current partial week
- Type/status badge convention (`components/SessionBadges.tsx`): type badges are outline pills with an activity-colour dot, status badges are filled (planned neutral, done success, skipped warning), so type and status never look alike. Cardio is the `chart-running` family and strength the `chart-strength` family everywhere (History cards, This Week tiles)
- `border-strong` token (`#8A857B`, 3.61:1 on surface, 3.37:1 on bg) for input, checkbox, switch and unselected-chip boundaries; focus rings use `primary-dark`
- `lib/chartPalette.ts` — chart colours read from the design-system CSS variables at runtime, with the spec hex as fallback (recharts writes SVG attributes, where `var()` is unreliable). Activity types map to their `chart-*` colour by name; tags and pace series use the categorical order; HR zones use `chart-zone-1…5`

### Changed

- **Sage palette** — the semantic tokens in `index.css` now hold the "Minimal & Clean" values, with accent, success, warning, error, chart, HR zone and shadow tokens added. The old blue `--color-primary-50…900` scale is gone
- Every hard-coded Tailwind palette class and chart hex colour in `frontend/src` is replaced by a semantic token or `chartPalette`, following the spec's recipes and contrast rules (white text only on `primary-dark` and charcoal `text` fills, plus the Strava brand button; `text-muted-strong` for small muted text, accent never as text). Exceptions: the Strava and Apple Health brand colours and the SVG logo files
- Radii normalised to Tailwind's defaults: status and type badges are pills (`rounded-full`), chips, toggles and inputs `rounded-sm`, buttons `rounded-lg`, cards and modals `rounded-xl`, bottom sheets 20px. The spec's `--radius-*` tokens are not adopted because they would override those defaults app-wide
- Logos recoloured to the sage palette; `theme-color` and the manifest already matched
- Week summaries share one helper (`summarizeWeek`) across the Plan card, Today and Stats glance, and one `getMondayOf` helper in `dateUtils` (Plan, Today, History and Log use it)

---

## 2026-10-05 — Today screen and mobile navigation (Phase 17, part 3)

### Added

- **Today screen** (`/today`) — today's date, a card per session planned today (Start, Move to tomorrow, Skip), a Resume card when a strength or cardio draft exists, Quick log tiles (Cardio, Strength, Steps) and a This week card (done of planned, next session). Uses existing endpoints only
- **Mobile shell below 768px** — slim header with a profile button that opens a bottom sheet (Templates, Steps, Profile, Settings, Sign out), and a Today / Plan / Stats tab bar (Stats is also active on `/sessions/:id`). The tab bar is hidden on `/log` and `/workout`
- **Safe areas** — `viewport-fit=cover`, tab bar padded by `env(safe-area-inset-bottom)`, content padded above the bar, Plan toast sits above it
- `getStartUrl` helper (`lib/planStart.ts`) shared by the Plan cards and Today; it builds strength URLs with `strengthViewUrl` and takes the view (`workout` or `form`) from the caller
- **Workout mode integration** — Today's strength Start, the Strength Quick log tile (blank workout) and the Resume card open workout mode below 768px and the full form from 768px; a strength Resume card restores the draft without asking (`resume=1`) and shows its title, sets done and age

### Behaviour notes

- **Skip on Today** — the backend only stores a skip note, and a session dated today keeps status `planned`. On Today a session with a non-empty skip note is shown as Skipped (badge, note, no Start / Move to tomorrow) with **Undo skip**, which clears the note (`PATCH …/skip-note` with `null`). Skipping from Today requires a note. The Plan page and its week counts still go by the backend status, so a session skipped today looks planned there until the day passes
- **Move to tomorrow** is hidden on Sundays: the reschedule API only moves a session within its own week
- **Strength Start without a template** opens a blank strength form (`/log?type=strength`) instead of doing nothing; a skipped session keeps its planned date (`&date=`) with or without a template
- **This week** uses the same counts as the Plan overview (`summarizeWeek`), has error and empty states, and the page recomputes today when the app returns to the foreground or at midnight
- **Resume** shows one card per draft (strength and cardio) with the draft's age when it stored a start or session date

### Changed

- Menu sheet is a real modal: focus moves in and returns to the trigger, Tab is trapped, body scroll is locked, and it closes on navigation
- Bottom-sheet modals (skip note, reschedule, adapt, plan form, exercise swap, Settings and Exercises dialogs) add `env(safe-area-inset-bottom)` padding below `sm`
- `/` and the post-login landing go to `/today` (was `/stats`); the desktop top nav gains **Today** as its first link

### Tests

- Today page (sessions, Start link, empty state, Resume card, skip modal, move to tomorrow, menu), `/` redirect, tab bar active state and visibility, menu sheet, `getStartUrl`

---

## 2026-10-05 — Workout mode (Phase 17, part 2)

### Added

- **Workout mode** (`/workout`) — a full-screen strength logger, one set at a time: header with close (keeps the draft), progress ("N of M sets · K of L exercises") and Finish (outlined until every set is done, so "Complete set" stays the one primary action); the current exercise with "Last time: 4 × 8 @ 57.5 kg" from last-session defaults; done sets as compact rows (tap to edit, Cancel restores), the current set as a large editor with separate reps and kg rows (−/+ 52px steppers, step 1 and 2.5, wide 32px typed inputs), an optional note and "Complete set"; delete on every set except the last with a 5-second Undo; "+ Add set" copies the last set
- **Rest timer** — starts when a set is completed (not after the final set); Reset, +30s and Skip; stores its end time in the draft so it survives reloads and backgrounding; length 60/90/120/180 s (default 90) in the options sheet, remembered on the device; vibrates at zero where supported
- **Choose exercise sheet** — To do (current highlighted, progress ring, "d of t sets · last …") and Done; "+ Add exercise" searches the exercise library and appends it with 3 sets prefilled from last session; "Choose an exercise" fills an entry that has none; the options sheet can remove the current exercise (asks first when it has completed sets; Undo follows); completing an exercise's last set moves to the next unfinished one, and "All exercises done" offers Finish
- **Finish sheet** — duration refreshed from the start time on each open unless typed (nearest minute, at least 1:00), how you feel / how hard, note, calories; saves through the same path as the full form, including the "Update template?" prompt (asked once; a retry neither asks again nor patches the template twice); a failed save keeps the sheet and draft with Retry and says "connection" only for network errors (server message for 4xx); Finish is blocked while an entry has no exercise
- **Entry points** — a strength plan card's Start opens workout mode below 768px and the full form from 768px (checked at tap time); the strength form has a "Workout mode" button and workout mode's options have "Full form"; switching writes the draft, replaces the history entry and resumes on the other side without the Restore prompt
- **Screen Wake Lock** while workout mode is open, where supported; bottom sheets trap focus, close on Escape (only the topmost modal reacts) and lock page scroll

### Changed

- **`useStrengthSessionForm` hook** now drives the strength form: state, URL params, template prefill, draft autosave/restore, payload, save and template diff live in one place shared with workout mode, so both send the same `POST` body
- **Strength draft** autosaves within 300 ms of every change (flushed when the page is hidden or closed) and is cleared only after a successful save; it records the current exercise, rest timer end and start time (older drafts still restore); `resume=1` in the URL restores it without asking, starting from the draft on the first render (the workout's start time is kept across reloads and view switches); opening workout mode alone doesn't create one
- **Restore/Discard prompt** names the waiting draft (title, date, sets done); until the user picks, the full form is inert, nothing is autosaved, Save is disabled and the URL template isn't loaded (Discard loads it); Restore no longer waits for the template request
- **Template loading** times out after 10 s and shows an error with Retry (a deleted template says so) instead of an endless "Loading…"
- **Saving** is guarded against double submits (including while the template is fetched for the diff prompt, which shows "Saving…" and keeps the form read-only) and replaces the history entry, so Back can't reopen the form; the "Update template?" answer holds for a retry with the same changes and is asked again when they differ; last-session defaults refresh after a save
- **`DiffModal`** moved to its own component for both views and is now an accessible modal (focus, Escape, 44px buttons, semantic tokens)

### Tests

- Characterization of the full form's `POST` body before the refactor; hook payload parity, draft round-trip (v1 and v2), draft cleared only on 2xx, set/exercise actions
- Workout mode: same `POST` body as the full form, complete set → rest timer and auto-advance, delete + undo position, edit done set + Cancel, Add set copy, Add exercise, reload restores exercise/sets/rest, Restore/Discard prompt, failed save + retry, Full form ↔ workout mode switch, sheet Escape/focus, Finish guard; rest timer countdown and vibration (fake timers), Wake Lock; plan card Start routing by viewport
- Review regressions: pending draft never overwritten, Back after a view switch or save, late template response, undo while editing a done set, stepper layout and weight input, placeholder fill and exercise removal, draft creation, duration refresh, retry without a second diff/PATCH, 4xx message, modal dialog, rest after the final set, double-tap Add exercise, stale-timer and wake-lock races

---

## 2026-10-05 — Mobile fundamentals (Phase 17, part 1)

### Fixed

- **No zoom on focus** — inputs, selects and textareas use 16px text below 640px so iOS Safari no longer zooms in
- **Scroll to top on navigation** — pushing or replacing a route scrolls to the top (Back/Forward keep their restored position); the Log form no longer opens mid-page
- **Tap targets** — plan card actions, "Add session", week arrows, set Done/delete, exercise header icons, Templates/Steps/History row actions (incl. Copy and the notes chevron) and chart toggles/chips are at least 44px below `md`
- **Charts** — y-axis labels use compact numbers (`14k`) and no longer wrap or clip, count axes use whole numbers, heatmap days are keyboard-reachable buttons that show their tooltip on tap (clamped to the screen, second tap closes), `</>` SQL buttons are hidden below `sm`, Overview, Plan Adherence and the History trends chart show an empty state when every week is zero/null (the API zero-fills weeks), Training Load labels its unit

### Changed

- **Strength set rows** take two lines below `sm` (`# · Reps · Weight · Done`, then `Note · Delete`); done sets are tinted instead of struck through (the Done control is an outlined 44px button, filled when done); DOM/tab order follows the visual order; "+ Add set" is a full-width button under the last set
- **Save/Cancel pinned** to the bottom of both Log forms below `md`; a failed save shows its error inside the bar, and `scroll-padding-bottom` keeps focused fields clear of it
- **Compact cardio segments** — duration, distance and pace share one row; **History cards** put badge, date and Copy on one line; **Plan** week title reads "Sep 28 – Oct 4" on phones and segment summaries wrap to two lines; **Steps** dates read "Sun, 4 Oct" and Templates/Steps Delete is an icon button at the far right
- **Semantic colour tokens** (`--color-primary`, `--color-bg`, `--color-surface`, `--color-text`, …) added to `@theme` with the current blue/slate values; emitted with `@theme static` so `var(--color-*)` is always available; `--color-surface` is now white and the page background lives in `--color-bg`

### Tests

- Scroll reset (push, replace, POP, query-only change), set rows (Done toggle and tint, delete removes the right set, tab order), failed-save error inside the pinned bar, empty chart states, Steps date format, compact tick formatting

### Tooling

- `eslint-disable` scoped to the shared RHF `any` props so `pnpm lint` exits 0

---

## 2026-10-01 — Exercise UX parity (log vs. edit)

### Fixed

- **Create exercises while logging** — the exercise picker now has a "+ New exercise" row at both levels (categories and exercises); it opens an inline name form, creates the exercise via `POST /exercises` (tagged with the current category when it is a real type), refreshes the exercise list and selects the new exercise
- **Edit strength session used an outdated UI** — editing now uses the same exercise list as logging (grouped picker, collapsible blocks, "+ Add Exercise" below the last block, inline create); wellbeing and RPE are editable and included in the PATCH payload

### Changed

- **Shared `StrengthExerciseList`** component extracted from `LogWorkoutPage`; `ExerciseEntryBlock` gains `prefillFromLastSession` (disabled in edit so choosing or swapping an exercise no longer overwrites existing sets)

### Tests

- Picker create flow (type_ids, selection, inline error, Enter does not submit the form) and edit-form parity (grouped picker, Add Exercise placement, no `last-session-defaults` call, wellbeing/RPE in PATCH)
## 2026-10-01 — Sliding auth session

### Changed

- **Sliding 7-day session** — refresh token lifetime is now 7 days (was 30, fixed) and is reissued on every `/auth/refresh`, so the session ends 7 days after last access
- **Silent refresh on 401** — the frontend refreshes the access token once (shared across concurrent requests) and retries the failed request instead of logging the user out after 60 minutes
- **Token types enforced** — access tokens carry `type: access`; refresh tokens are rejected as bearer tokens and access tokens are rejected by `/auth/refresh`; tokens without a `type` are still accepted as access tokens; Strava OAuth state tokens are only accepted as state
- `/auth/refresh` now returns 401 if the user was removed from `USERS`

### Added

- `COOKIE_SECURE` setting for the refresh cookie `Secure` flag (set `true` behind HTTPS)
- Startup warning when `SECRET_KEY` is the built-in default

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
