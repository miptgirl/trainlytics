# Phase 12 — Analytics Fixes & Navigation Revamp: Requirements

## Goal

Fix three broken analytics charts, reorganize the analytics UX to surface the most actionable charts by default, merge History and Analytics into a single "Stats" tab, simplify the API key profile UI, add a plan vs. actual summary on the Plan tab and in Analytics, and add two developer debug tools: a per-chart SQL viewer and an in-app SQL executor on the Profile page.

---

## Scope

### 1. Analytics Bug Fixes

Three charts introduced in Phase 10 return no data due to SQL issues in `backend/app/api/analytics.py`. Fix the queries so each chart returns correct data:

- **Activity Type Split** (`/analytics/cardio/activity-type-split`) — currently returns no rows.
- **Walk Segments per Session** (`/analytics/cardio/walk-segments`) — currently returns all-zero counts.
- **Distance Progression** (`/analytics/cardio/distance-progression`) — currently returns no distance data.

Fix SQL only. No schema changes, no new endpoints for the fixes themselves (the debug infrastructure below adds query visibility separately).

---

### 1b. Per-Chart SQL Viewer

Each analytics chart gets a small "nerdy" icon (e.g. a `</>` or database icon) in its header. Clicking it opens a modal or inline panel showing the raw SQL query the backend used to produce the chart's data.

**Backend:**
- All analytics endpoints accept an optional `?debug=true` query parameter.
- When set, the JSON response wraps the normal payload with a `debug` envelope:
  ```json
  { "data": [...], "debug": { "sql": "SELECT ..." } }
  ```
- The SQL string is the rendered query (with bind parameters substituted or shown inline) — not a query plan, not EXPLAIN output.
- When `debug=true` is absent, the response shape is unchanged (no performance impact on normal use).

**Frontend:**
- Chart components detect the debug icon click, re-fetch their endpoint with `?debug=true`, and display `debug.sql` in a modal with monospace formatting and horizontal scroll.
- The icon is always visible (not gated behind a setting) — it's small and unobtrusive.

---

### 2. Analytics UX Reorganization

Reorganize the Analytics sub-tab content (not the route — still `/stats?tab=analytics` after navigation revamp). No new endpoints needed for reorganization unless the new overview charts require them (see §2c).

#### 2a. Heatmap repositioned

Move the **Training Consistency Heatmap** to immediately below the all-time summary header. It is currently at the bottom of the page.

#### 2b. New overview charts (visible by default)

Add three new week-by-week bar charts covering the **last 12 weeks** (same window as existing trends charts). Each chart is a separate panel, all visible by default above the Strength section:

- **Sessions per week** — count of all logged sessions per week (strength + cardio combined)
- **Total training time per week** — sum of session durations in minutes per week
- **Total volume per week** — sum of `weight × reps` across all strength sets per week (cardio excluded)

These aggregate from existing session data. Back the three charts with a single new endpoint `GET /analytics/overview-trends` returning `{week_start, session_count, total_minutes, total_volume}` per week for the last 12 weeks.

#### 2c. Strength section layout

- **Weekly Volume by Type** — rename the existing Phase 10 "Strength Volume Breakdown" chart (stacked bar: weekly volume by muscle-group tag). Make it **visible by default**.
- **Weekly Exercises by Type** — new chart: stacked bar of exercise *count* (not volume) per muscle-group tag per week, last 12 weeks. Back it with a new endpoint `GET /analytics/strength/exercises-by-type`. Make it **visible by default**.
- All other strength charts (Exercise Progression, Personal Records panel, Rolling Averages) — **collapsed by default**, expandable.

#### 2d. Cardio section collapsed by default

The entire Cardio section starts collapsed. The user can expand it.

---

### 3. Navigation Revamp

#### Current tabs (8)
History, Log Workout, Templates, Plan, Analytics, Steps, Profile, Settings

#### New tabs (7)
**Stats**, Log Workout, Templates, Plan, Steps, Profile, Settings

- Merge **History** (`/history`) and **Analytics** (`/analytics`) into a single **Stats** tab at route `/stats`.
- `/stats` defaults to the Analytics sub-tab. Sub-nav within the page: **Analytics** (default) | **History**.
- Redirect `/history` → `/stats?tab=history` and `/analytics` → `/stats` (or `/stats?tab=analytics`) for backward-compat links.
- Tab order: Stats, Log Workout, Templates, Plan, Steps, Profile, Settings.
- Nav tabs are centered and use shorter labels where possible (e.g. "Log" instead of "Log Workout" is out of scope — keep existing labels unless they're obviously too long for mobile).

#### Session detail links
All links to `/sessions/:id` that originate from the history list continue to work unchanged — only the nav entry point changes.

---

### 4. Profile: API Key Simplification

Replace the current dual Anthropic / OpenAI key fields with a single flow:

1. **Provider selector** — radio or select: Anthropic | OpenAI (default: Anthropic).
2. **Single key field** — masked input with toggle-reveal; Save and Remove buttons.
3. On first load after deploy: **both existing stored keys are wiped**. User must re-enter the key for whichever provider they want to use.

Backend:
- New Alembic migration: add `ai_provider` (string, nullable) and `ai_key_encrypted` (string, nullable) columns to `user_settings`; drop (or nullify) the existing separate Anthropic/OpenAI encrypted columns.
- Migration sets both old key columns to NULL for all rows (wipe).
- `PATCH /profile` accepts `{ ai_provider: "anthropic" | "openai", ai_key: "<raw key>" }`.
- `GET /profile` returns `{ ai_provider, ai_key_configured: bool }` — never returns the raw key.
- AI service resolves provider and key from the single `ai_key_encrypted` column; `ai_provider` tells it which SDK to use.

---

### 5. Plan vs. Actual Summary

#### 5a. Plan tab — compact weekly card

Add a summary card to the top of the Plan tab (below or replacing the existing completion % card, or as a new card alongside it — below is preferred to avoid rearranging existing UI).

Card contents:
- **Cardio**: planned total distance (km) and duration (min) vs. logged totals for the week; delta shown.
- **Strength**: planned total exercise count and estimated volume (sets × reps × weight from template defaults) vs. logged totals; delta shown.
- Only "Done" sessions contribute to the logged side. "Planned" and "Skipped" sessions count on the planned side.

Backend: new endpoint `GET /plan/weekly-summary?week_start=YYYY-MM-DD` returning planned and actual totals.

#### 5b. Analytics tab — Plan Adherence section

Add a **Plan Adherence** section at the bottom of the Analytics sub-tab (visible by default). Contains a rolling 12-week chart with two metrics (one bar per week):

- **Completion %** — Done ÷ (Done + Skipped) for that week (same formula as existing weekly overview card).
- **Volume delta** — logged volume minus planned volume for strength (kg·reps), logged distance minus planned distance for cardio, shown as a signed bar.

Back with a new endpoint `GET /analytics/plan-adherence?weeks=12` returning `{week_start, completion_pct, strength_volume_delta, cardio_distance_delta}` per week.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| History + Analytics merge | "Stats" tab, sub-nav Analytics (default) / History | Resolves too-many-tabs feedback; Analytics is the primary destination |
| New overview charts time window | Last 12 weeks | Consistent with existing trends; familiar to the user |
| Plan vs. actual location | Both Plan tab and Analytics tab | Plan tab = immediate feedback; Analytics = long-horizon adherence |
| API key migration | Wipe both existing keys on deploy | Clean break; avoids state where both keys exist with no clear active one |
| Strength chart visibility | Weekly Volume + Exercises by Type visible; rest collapsed | Surface most useful default views; reduce page length |
| Weekly Exercises by Type | New chart (exercise count by muscle-group tag per week) | Complement to volume chart; answers "what did I train" vs "how much" |

---

### 6. Profile: SQL Executor (Debug Panel)

Extend the existing collapsible **Debug** panel at the bottom of the Profile page (currently shows AI request logs) with a new **SQL** sub-section.

**UI:**
- A `<textarea>` for entering arbitrary SQL.
- A **Run** button.
- Results rendered as a plain table: column headers in bold, rows below; scrollable horizontally.
- Error messages shown inline (e.g. syntax errors, constraint violations).
- A small warning label: *"Direct DB access — changes are permanent."*

**Backend:**
- New endpoint `POST /debug/sql` accepting `{ "sql": "..." }`.
- Auth-protected (same JWT middleware as all other endpoints).
- Executes the SQL against the application database using the existing SQLAlchemy session.
- Returns:
  ```json
  { "columns": ["col1", "col2"], "rows": [[...], [...]], "rowcount": N }
  ```
- No restriction to SELECT-only — the user is the sole owner of the data and may need to run UPDATE or DELETE to fix state during debugging.
- Response capped at 500 rows to avoid browser lockup on large result sets.
- Route registered only when a `DEBUG_SQL_ENABLED=true` env var is set; returns 404 otherwise. This prevents accidental exposure on deployments where it's not needed.

**Key constraints:**
- The endpoint is auth-protected and env-gated — not a general-purpose SQL injection surface.
- No query history persistence needed; the textarea is a one-shot input.

---

## Out of Scope for Phase 12

- Changing any route other than merging `/history` and `/analytics` → `/stats`
- New analytics metrics beyond those listed
- Changes to session logging, template, or step tracking flows
- Any AI prompt changes
- Garmin / Apple Health import
