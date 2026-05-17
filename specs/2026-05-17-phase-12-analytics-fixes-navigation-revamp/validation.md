# Phase 12 — Validation

## Progress

| Area | Status |
|---|---|
| Analytics Bug Fixes (SQL) | ✅ Complete — root cause: segments had NULL activity_type_id; fixed with COALESCE(segment.at_id, session.at_id) |
| Per-Chart SQL Viewer (?debug=true backend) | ✅ Complete — all /analytics/* endpoints support ?debug=true |
| New Analytics Backend Endpoints (Group 2) | ✅ Complete — 4 endpoints: overview-trends, exercises-by-type, plan-adherence, plan/weekly-summary |
| Navigation Revamp | ✅ Complete — /stats route with Analytics (default) / History sub-tabs; /history → /stats?tab=history redirect; /analytics → /stats redirect; nav shows 7 tabs |
| Analytics UX Reorganization | ✅ Complete — heatmap below summary; OverviewTrendsChart (sessions/time/volume); WeeklyExercisesByTypeChart; ExerciseProgression+PersonalRecords in "Show more" collapsible; Cardio collapsed; PlanAdherenceChart at bottom |
| Plan vs. Actual Card | ✅ Complete — PlanVsActualCard renders below WeeklyOverviewCard; shows planned/actual/delta for cardio (distance, duration) and strength (exercises, volume); refetches when weekStart changes |
| API Key Simplification | ✅ Complete — migration 0011 adds ai_key_encrypted; old columns wiped; PATCH /profile accepts {ai_provider, ai_key}; GET returns {ai_provider, ai_key_configured} |
| SQL Executor (Profile Debug) | ⬜ Not started |

---

## Definition of Done

A user can:
1. Open the Activity Type Split, Walk Segments, and Distance Progression charts and see correct non-zero data.
2. Navigate to the new **Stats** tab — Analytics sub-tab renders by default; switching to History shows the session list.
3. See the consistency heatmap immediately below the all-time summary, three overview charts above the Strength section, and Cardio section collapsed by default.
4. Open the Plan tab for the current week and see a Plan vs. Actual card showing planned and logged totals for cardio and strength.
5. Open the Analytics sub-tab and see a Plan Adherence section at the bottom with 12-week completion % and volume deltas.
6. Open Profile, see a single provider selector and one key field, re-enter their API key, and confirm AI features work.

---

## Success Criteria

### Analytics Bug Fixes

| Chart | Before | After |
|---|---|---|
| Activity Type Split | No data (empty chart) | Correct rows per activity type with non-zero duration |
| Walk Segments per Session | All-zero counts | Correct count of walk segments per session |
| Distance Progression | No distance data | Cumulative monthly distance per activity type |

### Navigation

- `/stats` loads with Analytics sub-tab active.
- `/stats?tab=history` loads with History sub-tab active.
- `/history` (old URL) redirects to `/stats?tab=history` with no 404.
- `/analytics` (old URL) redirects to `/stats` with no 404.
- Nav bar shows exactly 7 tabs: Stats, Log Workout, Templates, Plan, Steps, Profile, Settings.
- No horizontal overflow on a 375 px viewport (iPhone SE width).

### Analytics UX

- Heatmap appears directly below the all-time summary header (not at the bottom).
- Three overview charts (sessions/week, time/week, volume/week) appear above the Strength section and are visible on load.
- "Weekly Volume by Type" and "Weekly Exercises by Type" are visible by default.
- Exercise Progression, Personal Records, and Rolling Averages are collapsed by default; clicking "Show more" expands them.
- Cardio section starts collapsed.
- Plan Adherence section is visible at the bottom of the Analytics sub-tab.

### Plan vs. Actual Card

- Card appears on the Plan tab for the current week.
- Planned distance/duration updates when plans are added or removed.
- Actual distance/duration updates when sessions are logged.
- Week navigation (← / →) causes the card to refetch for the selected week.

### API Key

- Profile page shows a single provider selector and one key field.
- After deploy, both keys are cleared — user must re-enter.
- After saving a new key, AI features (weekly insights, adapt session) work correctly.
- Raw key is never returned from `GET /profile`.

### Per-Chart SQL Viewer

- Every chart panel in the Analytics sub-tab has a small `</>` icon in its header.
- Clicking the icon opens a modal containing a readable SQL query string.
- The SQL is non-empty and references recognizable table/column names.
- Closing the modal and re-opening re-fetches (no stale state).

### SQL Executor (Profile Debug Panel)

- The Debug panel on the Profile page contains a SQL textarea and Run button.
- `SELECT * FROM workout_sessions LIMIT 5` returns a table with correct column headers and rows.
- An invalid query (e.g. `SELECT * FROM nonexistent_table`) shows an inline error message.
- When `DEBUG_SQL_ENABLED` is not set in the env, the Run button returns an error or the section is hidden.

---

## Manual Validation — Local Deployment

**Prerequisites:** app running via `docker compose up --build` with migrations applied (`alembic upgrade head`).

### 1. Analytics bug fixes

1. Log at least two cardio sessions with different activity types (e.g. Run and Walk), each with at least one segment.
2. Open Stats → Analytics → Cardio section (expand it).
3. **Activity Type Split**: confirm the chart shows a bar or slice for each activity type with non-zero duration.
4. Log a Run session that contains at least one Walk segment (mixed-segment run).
5. **Walk Segments per Session**: confirm the chart shows a non-zero walk count for the session date.
6. **Distance Progression**: confirm the chart shows a cumulative line for each activity type with distance data.

### 2. Navigation

1. Open the app — confirm the nav shows Stats, Log Workout, Templates, Plan, Steps, Profile, Settings (7 tabs).
2. Click **Stats** — confirm the Analytics sub-tab is active by default.
3. Click **History** within the Stats sub-nav — confirm the session list appears.
4. Navigate to `/history` directly in the browser — confirm it redirects to the Stats / History sub-tab.
5. Navigate to `/analytics` directly — confirm it redirects to Stats / Analytics sub-tab.
6. Open in a 375 px viewport (DevTools device emulation) — confirm no horizontal scroll, all nav items accessible via hamburger.

### 3. Analytics UX reorganization

1. Open Stats → Analytics.
2. Confirm the heatmap appears directly below the all-time summary header (scroll position check).
3. Confirm three overview charts (Sessions/week, Training time/week, Volume/week) are visible above the Strength section without scrolling (or with minimal scroll).
4. Confirm "Weekly Volume by Type" and "Weekly Exercises by Type" are visible in the Strength section.
5. Confirm Exercise Progression, Personal Records, and Rolling Averages are collapsed; click "Show more" and confirm they expand.
6. Confirm the Cardio section is collapsed; click to expand and confirm charts appear.
7. Confirm the Plan Adherence section appears at the bottom of the Analytics sub-tab.

### 4. Plan vs. Actual card

1. Open **Plan** for the current week with at least one planned session.
2. Confirm the Plan vs. Actual card appears below the weekly overview card.
3. Log a session that matches a planned session (mark it Done).
4. Reload the Plan tab and confirm the card's "actual" side updates.
5. Navigate to a previous week — confirm the card updates to show that week's totals.

### 5. API key simplification

1. Open **Profile** — confirm the old dual Anthropic/OpenAI fields are gone.
2. Confirm a provider selector (Anthropic / OpenAI) and a single masked key field appear.
3. Confirm a notice indicates the key has been reset (on first load after deploy).
4. Enter an Anthropic key and save — confirm "Configured ✓" appears.
5. Navigate to History → AI Insights → "Analyse this week" — confirm AI response returns (not a "key not configured" error).
6. Remove the key — confirm AI features show the "configure key" prompt.
7. Check the browser network tab: confirm `GET /profile` does not return the raw key value.

### 6. Per-chart SQL viewer

1. Open Stats → Analytics.
2. Find the **Activity Type Split** chart (expand Cardio section first).
3. Click the `</>` icon in the chart header.
4. Confirm a modal appears with a SQL string (should include `SELECT`, a table name, and `GROUP BY` or similar).
5. Close the modal and click the icon on a different chart (e.g. Weekly Volume by Type).
6. Confirm the SQL string is different (each chart has its own query).
7. Open the browser network tab: confirm the request includes `?debug=true` and the response contains a `debug.sql` field.

### 7. SQL executor (Profile debug panel)

**Prerequisites:** add `DEBUG_SQL_ENABLED=true` to `.env` and restart containers.

1. Open **Profile** → expand the **Debug** panel.
2. Confirm the SQL sub-section appears below the AI logs section.
3. Type `SELECT * FROM workout_sessions LIMIT 5` and click **Run**.
4. Confirm a table appears with column headers matching the `workout_sessions` schema.
5. Type `SELECT COUNT(*) FROM cardio_segments` — confirm a single-cell result.
6. Type `SELECT * FROM nonexistent_table` — confirm an inline error is shown without crashing.
7. Remove `DEBUG_SQL_ENABLED` from `.env`, restart, and confirm the section is hidden or the Run button returns a 404 error.

---

## Testing

### Backend unit/integration tests (`backend/tests/`)

- `test_analytics.py`:
  - `test_activity_type_split_returns_data` — fixture with two sessions of different types; assert each type has non-zero duration.
  - `test_walk_segments_count` — fixture with a mixed-segment Run session; assert walk count > 0.
  - `test_distance_progression_returns_data` — fixture with distance data; assert cumulative distance > 0.
  - `test_overview_trends` — fixture with sessions over 3 weeks; assert correct session_count, total_minutes, total_volume per week.
  - `test_exercises_by_type` — fixture with exercises tagged by muscle group; assert correct exercise_count per tag per week.
  - `test_plan_adherence` — fixture with planned sessions (some Done, some Skipped); assert completion_pct and deltas correct.
- `test_plan.py` (or new `test_plan_summary.py`):
  - `test_plan_weekly_summary_empty_week` — week with no planned sessions returns zeros.
  - `test_plan_weekly_summary_mixed` — week with Done + Skipped planned sessions returns correct planned/actual split.
- `test_profile.py`:
  - `test_patch_profile_ai_key` — PATCH with new provider+key; GET returns `ai_key_configured: true`, raw key absent.
  - `test_migration_wipes_keys` — confirm old key columns are NULL after migration.
- `test_debug.py`:
  - `test_debug_sql_disabled_returns_404` — endpoint not mounted when `DEBUG_SQL_ENABLED` is unset.
  - `test_debug_sql_select` — valid SELECT returns correct columns and rows, capped at 500.
  - `test_debug_sql_invalid` — bad SQL returns HTTP 400 with an `error` field.
  - `test_analytics_debug_flag` — any analytics endpoint with `?debug=true` returns `{ data, debug: { sql } }` where `sql` is a non-empty string.

### Frontend tests (`frontend/src/__tests__/`)

- Update any snapshot or routing tests that reference `/history` or `/analytics` routes.
- Add a smoke test for `StatsPage` that confirms both sub-tabs render without crashing.
- Confirm `PlanVsActualCard` renders planned and actual values from a mocked API response.

### Regression checks

- Run the full test suite (`pytest` backend, `vitest` frontend) before marking the phase complete.
- Confirm all Phase 11 plan features still work (copy-from-last-week, skip notes, start-from-plan) — the plan data model is unchanged; only the summary card is new.
- Confirm AI weekly insights and adapt-session still work after the API key migration.
