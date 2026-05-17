# Phase 12 — Implementation Plan

## Status

| Group | Status | Notes |
|---|---|---|
| Group 1 — Analytics Bug Fixes + SQL Debug | ✅ Complete | All 3 SQL bugs fixed; debug=true on all /analytics/* endpoints; 18 tests pass |
| Group 2 — New Analytics Backend Endpoints | ✅ Complete | 4 endpoints added; all existing tests pass |
| Group 3 — API Key Simplification | ✅ Complete | ai_key_encrypted column added; old columns wiped; single ai_key field in API; 14 tests pass |
| Group 4 — Navigation Revamp | ✅ Complete | StatsPage with Analytics/History sub-nav; /history and /analytics redirect; Layout has 7 tabs |
| Group 5 — Analytics UX Reorganization | ⬜ Not started | Depends on Groups 2 + 4 |
| Group 6 — Plan vs. Actual Card | ⬜ Not started | Depends on Group 2.3 |
| Group 7 — Profile API Key (Frontend) | ⬜ Not started | Depends on Group 3 |
| Group 8 — SQL Debug Tools | ⬜ Not started | Depends on Group 1.4 (done) |
| Group 9 — Tests & Cleanup | ⬜ Not started | |

---

Each group is a discrete unit of work. Groups within the same section can be done in parallel; groups with a `→` dependency must follow their predecessor.

---

## Group 1 — Analytics Bug Fixes + SQL Debug Infrastructure (Backend)

File: `backend/app/api/analytics.py` (and `backend/app/services/sessions.py` if logic lives there)

1.1 **Fix Activity Type Split SQL**
- Diagnose why `/analytics/cardio/activity-type-split` returns no rows (likely a JOIN or GROUP BY issue with `activity_types` or a missing filter).
- Fix the query; confirm it returns one row per activity type with a non-zero duration sum.

1.2 **Fix Walk Segments per Session SQL**
- Diagnose why `/analytics/cardio/walk-segments` returns all-zero counts.
- Fix the query so sessions with embedded Walk segments within a Run session are counted correctly.

1.3 **Fix Distance Progression SQL**
- Diagnose why `/analytics/cardio/distance-progression` returns no distance data.
- Fix the query so it returns cumulative monthly distance per activity type.

1.4 **Add `?debug=true` support to analytics endpoints**
- Create a shared helper (e.g. `render_sql(query)`) that compiles a SQLAlchemy query to a SQL string with bound parameters substituted, suitable for display.
- For each analytics endpoint, when `?debug=true` is present in the request, wrap the normal return value in `{ "data": <normal_payload>, "debug": { "sql": "<rendered_sql>" } }`.
- When the flag is absent the response shape is unchanged.
- Apply to all endpoints under `/analytics/*` (including the three being fixed above and the new ones in Group 2).

---

## Group 2 — New Analytics Backend Endpoints

Dependencies: none (can run in parallel with Group 1)

2.1 **Overview trends endpoint** `GET /analytics/overview-trends`
- Returns `[{week_start, session_count, total_minutes, total_volume}]` for the last 12 complete weeks (Mon–Sun) plus the current in-progress week.
- `total_volume` sums `weight × reps` across all strength sets for sessions in the week; cardio sessions contribute 0 volume.
- Add Pydantic schema in `backend/app/schemas/analytics.py`.
- Register route in `backend/app/api/analytics.py`.

2.2 **Weekly Exercises by Type endpoint** `GET /analytics/strength/exercises-by-type`
- Returns `[{week_start, muscle_group_tag, exercise_count}]` for the last 12 weeks.
- `exercise_count` = number of distinct exercises logged that carry that muscle-group tag, aggregated per week.
- If an exercise has multiple tags, count it once per tag per week.

2.3 **Plan vs. actual weekly summary** `GET /plan/weekly-summary?week_start=YYYY-MM-DD`
- Returns planned and actual totals for the requested week:
  ```json
  {
    "planned": { "cardio_distance_km": ..., "cardio_duration_min": ..., "strength_exercise_count": ..., "strength_volume_kg_reps": ... },
    "actual":  { "cardio_distance_km": ..., "cardio_duration_min": ..., "strength_exercise_count": ..., "strength_volume_kg_reps": ... }
  }
  ```
- Planned side: all planned sessions for the week (Done + Skipped + Planned).
- Actual side: all workout sessions logged on dates within the week that match a Done planned session.
- Register route in `backend/app/api/plan.py` (or a new `backend/app/api/plan_summary.py`).

2.4 **Plan adherence trends endpoint** `GET /analytics/plan-adherence?weeks=12`
- Returns `[{week_start, completion_pct, strength_volume_delta, cardio_distance_delta}]` for the last N weeks.
- `completion_pct` = Done ÷ (Done + Skipped); null if no sessions were planned.
- Deltas = actual − planned (negative means under).

---

## Group 3 — API Key Simplification (Backend + Migration)

Dependencies: none

3.1 **Alembic migration**
- Add `ai_provider VARCHAR` (nullable) and `ai_key_encrypted TEXT` (nullable) to `user_settings`.
- Set both old separate key columns to NULL for all rows (wipe migration).
- Keep old columns present but unused until Group 3.2 is deployed, then they can be dropped in a follow-up migration (not required in Phase 12).

3.2 **Update AI service**
- `app/services/ai_service.py`: read provider from `user_settings.ai_provider` and key from `ai_key_encrypted`.
- Remove references to the old separate Anthropic/OpenAI key columns.

3.3 **Update profile API**
- `PATCH /profile`: accept `{ ai_provider, ai_key }` in place of the old separate key fields.
- `GET /profile`: return `{ ai_provider, ai_key_configured: bool }`.
- Validate `ai_provider` is one of `"anthropic"` or `"openai"`.

---

## Group 4 — Navigation Revamp (Frontend)

Dependencies: none (can run alongside Groups 1–3)

4.1 **Create `StatsPage` component**
- New file `frontend/src/pages/StatsPage.tsx`.
- Contains sub-nav: **Analytics** | **History** (tab buttons or links).
- Default sub-tab: Analytics.
- State: `activeTab` driven by `?tab=history` query param; defaults to `"analytics"`.
- Renders `<AnalyticsPage />` or `<HistoryPageContent />` inline depending on active sub-tab (extract content from existing pages into reusable components if needed).

4.2 **Update routing in `App.tsx`**
- Add `/stats` route → `<StatsPage />`.
- Add redirects: `/history` → `/stats?tab=history`, `/analytics` → `/stats`.
- Remove standalone `/history` and `/analytics` routes (they now redirect).

4.3 **Update `Layout.tsx` nav**
- Replace the History and Analytics `NavLink` entries with a single **Stats** link to `/stats`.
- Apply active styling when either `/stats` or the old paths match (use `isActive` with custom logic or match on `/stats`).
- Ensure the resulting tab list renders cleanly on mobile (hamburger menu) and desktop.

4.4 **Update internal links**
- Search for all `to="/history"` and `to="/analytics"` links in the codebase (session detail back-links, weekly insights card, etc.) and update to `/stats` or `/stats?tab=history` as appropriate.

---

## Group 5 — Analytics UX Reorganization (Frontend)

Dependencies: Group 2 (needs the new endpoints), Group 4 (Stats page must exist)

5.1 **Move Consistency Heatmap**
- In `AnalyticsPage` (or its extracted content component), move the heatmap section to immediately below the all-time summary header. No data or API changes needed.

5.2 **Add Overview charts section**
- New `OverviewTrendsChart` component (or three small chart panels).
- Fetches `GET /analytics/overview-trends`.
- Three bar charts: sessions per week, training time per week (mins), volume per week (kg·reps).
- All three visible by default, above the Strength section.

5.3 **Strength section layout**
- Rename "Strength Volume Breakdown" label → "Weekly Volume by Type". No data change needed.
- Add `WeeklyExercisesByTypeChart` component fetching `GET /analytics/strength/exercises-by-type`.
- Both Weekly Volume and Weekly Exercises by Type visible by default.
- Exercise Progression, Personal Records, and Rolling Averages sections: wrapped in a collapsible (collapsed by default, with "Show more" toggle).

5.4 **Cardio section collapsed by default**
- Wrap the entire Cardio section in a collapsible. Collapsed on initial render.

5.5 **Plan Adherence section**
- New `PlanAdherenceChart` component at the bottom of the Analytics sub-tab (visible by default, not collapsed).
- Fetches `GET /analytics/plan-adherence?weeks=12`.
- Two series: completion % line + volume delta bars (or two separate small charts if combined chart is too cluttered).

---

## Group 6 — Plan Tab: Plan vs. Actual Card (Frontend)

Dependencies: Group 2.3

6.1 **Plan vs. Actual weekly card**
- New `PlanVsActualCard` component in the Plan tab.
- Fetches `GET /plan/weekly-summary?week_start=<current week Monday>`.
- Refetches when the week navigation changes.
- Displays: cardio planned/actual distance and duration; strength planned/actual exercise count and volume; delta values.
- Add the card below the existing weekly overview card.

---

## Group 7 — Profile: API Key Simplification (Frontend)

Dependencies: Group 3

7.1 **Update Profile page**
- Replace the dual Anthropic / OpenAI key fields with a provider selector (radio or segmented control) and a single masked key input.
- Show current configured state: "Configured ✓" or "Not set".
- Save and Remove buttons behave the same as before.
- Display a one-time notice: "API key has been reset. Please re-enter your key."

---

## Group 8 — SQL Debug Tools

### 8a — Per-chart SQL icon (Frontend)

Dependencies: Group 1.4 (the `?debug=true` backend support)

8.1 **`SqlDebugModal` component**
- New shared component: takes a `fetchUrl` (the chart's endpoint URL) and an `isOpen` / `onClose` prop.
- When opened, re-fetches `fetchUrl + "?debug=true"` and displays `response.debug.sql` in a `<pre>` block with monospace font, syntax highlighting optional, horizontal scroll enabled.
- Shows a loading spinner while fetching.

8.2 **Add debug icon to each chart panel header**
- Each analytics chart panel header gets a small `</>` icon button (e.g. `CodeBracketIcon` from Heroicons or a Unicode fallback).
- Clicking opens `SqlDebugModal` with the chart's endpoint URL.
- Apply to all charts under the Analytics sub-tab (including new ones from Group 5).

### 8b — SQL executor in Profile debug panel (Backend + Frontend)

Dependencies: Group 3 (profile page work already in progress)

8.3 **Backend: `POST /debug/sql` endpoint**
- New file `backend/app/api/debug.py` (or add to `backend/app/api/profile.py`).
- Auth-protected. Only registered when `DEBUG_SQL_ENABLED=true` env var is set; otherwise the route is not mounted and returns 404.
- Accepts `{ "sql": "<query>" }`.
- Executes via the existing SQLAlchemy `AsyncSession`; supports any SQL (SELECT, UPDATE, DELETE — user owns their data).
- Returns `{ "columns": [...], "rows": [[...], ...], "rowcount": N }` capped at 500 rows.
- On error returns `{ "error": "<message>" }` with HTTP 400.

8.4 **Frontend: SQL sub-section in Profile debug panel**
- Below the existing AI request logs section in the collapsible Debug panel.
- A `<textarea>` (monospace, ~6 rows) for SQL input.
- A **Run** button; disabled while a request is pending.
- Results rendered as a plain scrollable table with bold column headers.
- Inline error display if the backend returns an error.
- Warning label: *"Direct DB access — changes are permanent."*

---

## Group 9 — Tests & Cleanup

9.1 **Backend: update / add tests** in `backend/tests/test_analytics.py`
- Test each fixed SQL query returns correct data for a fixture dataset.
- Test the three new endpoints (overview-trends, exercises-by-type, plan-adherence) for correct aggregation.
- Test `GET /plan/weekly-summary` for a week with mixed planned/done/skipped sessions.
- Test `?debug=true` on one analytics endpoint returns `{ data, debug: { sql } }` with a non-empty SQL string.

9.2 **Backend: test `POST /debug/sql`**
- Returns 404 when `DEBUG_SQL_ENABLED` is not set.
- Returns correct columns + rows for a valid SELECT.
- Returns 400 with an error message for invalid SQL.
- Caps results at 500 rows.

9.3 **Backend: test updated profile API**
- Test `PATCH /profile` with new key field; test that old keys are not returned.

9.4 **Frontend: update routing tests** (if any exist for navigation).

9.5 **Run existing test suite** — confirm no regressions.
