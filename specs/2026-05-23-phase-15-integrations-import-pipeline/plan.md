# Phase 15 — Integrations: Import Pipeline
## Implementation Plan

### 1. Database & Environment Setup ✅ DONE

1.1 Add Strava columns to `user_settings` Alembic migration:
- `strava_access_token` (Text, nullable, encrypted)
- `strava_refresh_token` (Text, nullable, encrypted)
- `strava_token_expires_at` (DateTime with timezone, nullable)
- `strava_athlete_id` (BigInteger, nullable)
- `strava_last_synced_at` (DateTime with timezone, nullable)
- `strava_sync_start_date` (Date, nullable)

1.2 Create `pending_imports` table migration:
- `id`, `source` (enum: strava/apple_health), `external_id` (Text, unique per source), `raw_data` (JSONB), `mapped_session` (JSONB), `status` (enum: pending/accepted/discarded), `created_at`, `updated_at`

1.3 Create `body_metrics` table migration:
- `id`, `date` (Date, unique), `resting_hr_bpm` (Float), `hrv_sdnn_ms` (Float), `weight_kg` (Float), `sleep_duration_seconds` (Integer), `sleep_quality` (Integer 0–100), `vo2_max` (Float), `active_energy_kcal` (Float)

1.4 Add health metric preference columns to `user_settings` migration (same migration as 1.1):
- `health_metric_resting_hr` (Boolean, default true)
- `health_metric_hrv` (Boolean, default true)
- `health_metric_weight` (Boolean, default true)
- `health_metric_sleep` (Boolean, default true)
- `health_metric_vo2_max` (Boolean, default true)
- `health_metric_active_energy` (Boolean, default true)

1.5 Add env var support: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI` (all optional; Strava features disabled when absent)

> Migration: `bdc9905e1b7f_phase15_strava_imports_body_metrics.py` — applied 2026-05-23

---

### 2. Strava OAuth & Token Management (Backend)

2.1 `GET /strava/auth-url` — construct and return the Strava authorization URL with `activity:read_all` scope; return 503 if Strava env vars not configured

2.2 `GET /strava/callback` — exchange authorization code for access + refresh tokens via Strava API; encrypt and store in `user_settings`; redirect browser to `/#/profile?strava=connected` on success or `/#/profile?strava=error` on failure

2.3 Token refresh helper in `strava_service.py` — check `strava_token_expires_at` before each API call; refresh silently if expired; update stored tokens

2.4 `DELETE /strava/disconnect` — clear all `strava_*` columns on `user_settings`

---

### 3. Strava Activity Fetch & Mapping (Backend)

3.1 `POST /strava/fetch` — validate Strava is connected; enqueue background task; return `{ queued: true }` immediately

3.2 Fetch worker in `strava_service.py`:
- Pull activities from `GET /athlete/activities` with `after` timestamp (from `strava_sync_start_date` or `strava_last_synced_at`, whichever is later)
- Paginate through all result pages (200 per page)
- For each activity, fetch detailed laps via `GET /activities/{id}/laps`
- Map to `mapped_session` JSON: `{ type, source, activity_type, date, duration_seconds, distance_m, calories, avg_hr_bpm, title, segments: [{ distance_m, duration_seconds, pace_s_per_km, activity_type }] }`
- Upsert into `pending_imports` by `(source=strava, external_id=activity_id)` — skip if already accepted/discarded
- Update `strava_last_synced_at` on completion

3.3 Activity type mapping function: case-insensitive match of Strava type to existing Trainlytics activity types; fall back to `null` with `proposed_type_name` in the mapped JSON

---

### 4. Apple Health XML Parser (Backend)

4.1 `POST /apple-health/upload` — accept multipart form with zip file; write to temp dir; start background parse task via FastAPI `BackgroundTasks`; return `{ task_id }`

4.2 Zip extraction helper: extract `export.xml` from the zip into the temp directory; clean up zip; ignore workout route GPX files

4.3 Load user's health metric preferences from `user_settings` before parsing begins; pass as a `MetricPreferences` dataclass to the parser so it can gate each record type

4.4 SAX-style parser using `iterparse` on `export.xml`:

- **HKWorkout records** → `pending_imports` rows (always processed, not gated by metric prefs)
  - Map `workoutActivityType` to Trainlytics activity type using the same mapping function as Strava
  - Extract `duration`, `totalDistance`, `totalEnergyBurned`
  - Single-segment session (Apple Health doesn't expose laps in the standard export)
  - `external_id = HKWorkout_{startDate}`

- **HKQuantityTypeIdentifierRestingHeartRate** → `body_metrics.resting_hr_bpm` *(if `health_metric_resting_hr` enabled)*
- **HKQuantityTypeIdentifierHeartRateVariabilitySDNN** → `body_metrics.hrv_sdnn_ms` *(if `health_metric_hrv` enabled)*
- **HKQuantityTypeIdentifierBodyMass** → `body_metrics.weight_kg` *(if `health_metric_weight` enabled)*
- **HKCategoryTypeIdentifierSleepAnalysis** → sum `HKCategoryValueSleepAnalysisAsleepUnspecified` + `HKCategoryValueSleepAnalysisAsleepCore` + `HKCategoryValueSleepAnalysisAsleepDeep` + `HKCategoryValueSleepAnalysisAsleepREM` per date → `body_metrics.sleep_duration_seconds` *(if `health_metric_sleep` enabled)*
- **HKQuantityTypeIdentifierVO2Max** → `body_metrics.vo2_max` *(if `health_metric_vo2_max` enabled)*
- **HKQuantityTypeIdentifierActiveEnergyBurned** → sum per date → `body_metrics.active_energy_kcal` *(if `health_metric_active_energy` enabled)*
- All other record types: skipped

4.5 Upsert `body_metrics` rows by date (merge on conflict); skip columns whose metric preference flag is disabled

4.6 Task status tracking: store progress dict in a module-level dict keyed by `task_id`; `GET /apple-health/status/{task_id}` reads from it; keys: `status` (running/done/error), `workouts_staged`, `metrics_saved`, `errors`

4.7 Temp directory cleanup after parsing completes (success or error)

---

### 5. Import Review Queue (Backend)

5.1 `GET /imports/pending` — return all `pending` rows ordered by date desc; include mapped_session preview and source badge

5.2 `POST /imports/{id}/accept` — deduplication check: query `workout_sessions` for same date ± 1 day with duration within ±60 seconds; if found, return 409 `{ conflict: { session_id, date, duration } }`; otherwise create session from `mapped_session` JSON and mark row `accepted`

5.3 `POST /imports/{id}/accept?force=true` — skip deduplication check; create session and mark accepted

5.4 `POST /imports/{id}/discard` — mark row `discarded`

5.5 `PATCH /imports/{id}` — update `mapped_session` fields (date, activity_type, title, notes); re-validate structure with Pydantic before saving

5.6 `POST /imports/accept-all` — iterate pending rows in date order; accept each with dedup check; collect conflicts; return `{ accepted, conflicts: [{ import_id, session_id }] }`

---

### 6. Import Review Queue (Frontend)

6.1 New "Imports" section in the Profile page (below Strava and Apple Health controls), visible when `pending_imports` is non-empty

6.2 Import row component:
- Source badge (Strava / Apple Health) + activity type + date + duration + distance (if cardio)
- Accept button → calls accept; on 409 shows inline "Possible duplicate of [session title on date] — accept anyway?"
- Discard button with confirmation prompt
- Expand toggle → shows full `mapped_session` JSON as a preview table

6.3 Inline edit before accept: tap to edit title, date, activity type (dropdown of existing types); save updates `PATCH /imports/{id}`; changes shown on the row immediately

6.4 "Accept All" button at the top of the list with a count badge; after completion shows "X accepted, Y conflicts to review"

6.5 Empty state: "No pending imports" with links to Strava sync and Apple Health upload

---

### 7. Strava Profile UI

7.1 "Connections" section in Profile above the API key section

7.2 Disconnected state:
- "Connect Strava" button → calls `GET /strava/auth-url`, redirects user; only shown when Strava env vars are configured

7.3 Connected state:
- Strava athlete name + avatar URL (stored from OAuth response)
- Sync start date picker (date input; defaults to 1 year ago; updates via `PATCH /profile` or dedicated field)
- Last synced: "{timestamp}" or "Never"
- "Sync now" button → calls `POST /strava/fetch`; shows spinner while pending; on complete shows "Queued X activities for review"
- "Disconnect" button with confirmation

---

### 8. Apple Health Profile UI

8.1 "Apple Health" subsection in Connections (below Strava)

8.2 Metric preferences checklist — shown above the upload control, always visible:
- Six toggles: Resting HR / HRV / Body Weight / Sleep / VO2 Max / Active Energy
- All default to enabled
- Changes saved immediately via `PATCH /profile`; no save button needed
- Small note below: "Only enabled metrics will be imported and shown in Analytics"

8.3 Upload control: file input accepting `.zip` files + drag-and-drop zone with instructions ("Export from iPhone → Health app → your avatar → Export All Health Data")

8.4 Upload progress: progress bar while uploading; "Parsing…" state while background task runs (polls `GET /apple-health/status/{task_id}` every 3 seconds)

8.5 Completion state: "X workouts staged for review · Y health metric days imported"; link to the imports list

8.6 Error state: show parser error messages from the status response

---

### 9. Health Analytics Section

9.1 New "Health" collapsible section at the bottom of the Analytics tab (below Readiness & Wellbeing)

9.2 Up to six line charts (Recharts), each with a 90-day default range and a period selector (30/90/180/all days); a chart is rendered only if its corresponding metric preference is enabled:
- Resting HR over time (bpm)
- HRV (SDNN) over time (ms)
- Body weight over time (kg)
- Sleep duration over time (hours)
- VO2 Max over time (mL/kg/min)
- Active energy burned per day (kcal)

9.3 Backend: `GET /analytics/health-metrics?days=90` returns a list of `{ date, resting_hr_bpm, hrv_sdnn_ms, weight_kg, sleep_duration_seconds, vo2_max, active_energy_kcal }` rows ordered by date; nulls preserved so the frontend can skip missing days; the endpoint reads user's metric preferences and omits disabled columns from the response

9.4 Charts show a "No data — import Apple Health data to see this section" empty state when no body_metrics rows exist for that metric

9.5 If all metrics are disabled: show an "All metrics are disabled — enable them in Profile → Apple Health" message in place of the section

---

### 10. AI Context Enrichment

10.1 In `ai_service.py`, add a `get_health_context_block(db, user_prefs)` helper that computes weekly averages for four time windows (skipping nulls and disabled metrics):
- Last 7 days ("this week")
- 7-day window centred on 1 month ago (days −35 to −28)
- 7-day window centred on 3 months ago (days −97 to −90)

10.2 Format the block as a compact comparison table so the AI can interpret trends:
```
Health metrics (weekly averages):
                  Now     ~1mo ago   ~3mo ago
Resting HR (bpm)   52        55         58
HRV SDNN (ms)      68        62         55
Sleep (h)          7.3       6.8        7.1
Weight (kg)        64.2      65.1       66.0
```
Rows are omitted when all three windows have no data for that metric, or when the metric is disabled in user preferences. Entire block omitted when no data exists at all.

10.3 Inject the block between the athlete profile block and the training history block in `build_prompt()` for all three AI endpoints (weekly insights, adapt session, adapt cardio session)

10.4 Include the health context block within the existing prompt cache region

---

### 11. Tests

11.1 Backend — Strava:
- Token encryption/decryption round-trip
- Activity type mapping (known types, unknown types)
- Lap-to-segment mapping for a sample activity payload
- `POST /strava/fetch` returns 503 when env vars not set
- Auth URL endpoint returns valid URL shape

11.2 Backend — Apple Health parser:
- Unit tests for each record type with minimal XML fragments (resting HR, HRV, body weight, sleep, workout)
- Sleep aggregation across multiple HKCategoryValueSleepAnalysis records for the same date
- Workout mapping for a known and an unknown activity type

11.3 Backend — Import queue:
- Accept creates a session and marks row accepted
- Accept returns 409 when duplicate detected (same date, duration within 60s)
- Accept with `force=true` bypasses dedup check
- Discard marks row discarded, does not create session
- `PATCH /imports/{id}` updates mapped_session fields

11.4 Backend — Health analytics:
- `GET /analytics/health-metrics` returns correct rows for requested period
- Null columns preserved in response (not coerced to 0)

11.5 Backend — AI context:
- `get_health_context_block` returns `None` when no recent data
- Returns correctly formatted block when data exists
- Block appears in prompt passed to AI client (mock the client)

11.6 Frontend — Vitest:
- ImportRow renders source badge, activity type, date
- Accept flow: success → row removed; 409 → duplicate warning shown
- Discard flow: confirmation → row removed
