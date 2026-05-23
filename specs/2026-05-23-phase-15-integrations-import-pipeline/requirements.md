# Phase 15 — Integrations: Import Pipeline
## Requirements

### Scope

Two parallel import pipelines that bring external training data into Trainlytics without losing the manual-logging quality that makes the app useful. Every import goes through a staged review queue — the user accepts or discards each item before anything is persisted as a real session.

**Phase 15a — Strava**
- OAuth 2.0 connection from the Profile page
- Pull cardio activities for a user-configured date range
- Map Strava laps to Trainlytics cardio segments
- Stage all fetched activities in a review queue

**Phase 15b — Apple Health**
- Upload the Apple Health export zip from Profile
- Parse workouts, resting HR, HRV, body weight, sleep, VO2 max, active energy
- Stage workouts in the same review queue as Strava
- Persist daily health metrics (resting HR, HRV, weight, sleep, VO2 max) directly — no review needed for metrics, only for workouts
- User configures which metrics they want tracked; only enabled metrics are parsed and shown
- Show health metrics in a new Analytics section
- Include recent health metrics (last 7 days) in AI coaching prompts

---

### Key Decisions

**Strava laps → segments**
Each Strava lap becomes one Trainlytics cardio segment (distance, duration, pace). Activities with no lap data import as a single segment using the activity totals. This matches the existing manual logging model and preserves the most detail available.

**Import date range: configurable in Profile**
The first sync start date is set by the user in Profile before fetching. The field defaults to one year ago. Last-synced timestamp is stored and shown in Profile. Subsequent fetches pull only activities after the last sync.

**Review queue: everything goes through it**
All imported workouts (Strava and Apple Health) are staged before being committed. The user accepts, discards, or lightly edits each. Accepting creates a real session exactly as if the user had logged it manually. There is no bulk accept without review — Accept All is available but clearly labeled.

**All workout types imported, user decides in review**
Strava and Apple Health both surface strength-type activities (WeightTraining, FunctionalStrengthTraining, etc.). These are staged in the review queue as duration-only strength sessions (no exercise/set detail, since that data doesn't exist in either source). The user sees what it is and decides whether to keep it.

**Activity type mapping**
Strava and Apple Health activity type strings are mapped to Trainlytics activity types by name match (case-insensitive). If no match exists, the import row proposes creating a new activity type; the user can accept the creation or remap to an existing type before committing.

Strava → Trainlytics mappings:
| Strava type | Trainlytics activity type |
|---|---|
| Run | Run |
| Ride | Cycle |
| Walk | Walk |
| Swim | Swim |
| WeightTraining, FunctionalStrengthTraining | strength session |
| Other | proposed new type |

Apple Health → Trainlytics mappings follow the same pattern using `HKWorkoutActivityType*` names.

**Health metric preferences**
The user controls which health metrics are tracked. Preferences are stored as a set of boolean flags in `user_settings` (default: all enabled). The six configurable metrics are: Resting HR, HRV (SDNN), Body Weight, Sleep Duration, VO2 Max, Active Energy.

Preferences are set in Profile → Apple Health, as a simple checklist before or after uploading. When a metric is disabled:
- The parser skips its record type entirely — the column is never written to `body_metrics`
- The corresponding chart is hidden in the Analytics → Health section
- The field is excluded from the AI health context block

Re-importing with a metric re-enabled will backfill data from the original export only if the user uploads again (the XML is not retained server-side). There is no "delete this metric's data" action in Phase 15 — that can be added later if needed.

**Deduplication**
On accept, the backend checks for existing sessions on the same date with duration within ±60 seconds. If a potential duplicate is found, the accept call returns a 409 with the conflicting session ID; the frontend shows a "possible duplicate" warning and requires explicit confirmation to proceed.

**Apple Health file handling: SAX-style streaming parse**
Apple Health exports can exceed 100 MB. The backend uses Python's `xml.etree.ElementTree.iterparse` to stream the XML without loading the full document into memory. No file size limit is enforced. The uploaded file is written to a temp directory, parsed, then deleted. Parsing runs as a background task; the frontend polls for completion.

**Token storage**
Strava OAuth access and refresh tokens are stored encrypted in the `user_settings` table using the same Fernet + PBKDF2-HMAC-SHA256 scheme already in use for AI API keys.

**Strava OAuth configuration**
Three new env vars required: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`. The redirect URI must point to the backend callback endpoint (e.g. `https://your-server.example.com/api/strava/callback`). These are optional — Strava features are hidden in Profile if not configured.

---

### New Database Tables

**`pending_imports`**
Staging table for all imported workouts (Strava + Apple Health).
```
id, source (strava | apple_health), external_id, raw_data (jsonb),
mapped_session (jsonb), status (pending | accepted | discarded),
created_at, updated_at
```
Rows are deleted 30 days after being accepted or discarded.

**`body_metrics`**
Daily health metrics from Apple Health.
```
id, date (unique), resting_hr_bpm, hrv_sdnn_ms, weight_kg,
sleep_duration_seconds, sleep_quality (0–100), vo2_max, active_energy_kcal
```
One row per calendar date. Upserted on re-import.

**`strava_tokens` columns on `user_settings`**
Rather than a new table, add columns to the existing `user_settings` table:
```
strava_access_token (encrypted), strava_refresh_token (encrypted),
strava_token_expires_at, strava_athlete_id, strava_last_synced_at,
strava_sync_start_date
```

**Health metric preference columns on `user_settings`**
Six boolean columns, all defaulting to `true`:
```
health_metric_resting_hr (bool, default true)
health_metric_hrv (bool, default true)
health_metric_weight (bool, default true)
health_metric_sleep (bool, default true)
health_metric_vo2_max (bool, default true)
health_metric_active_energy (bool, default true)
```
Updated via `PATCH /profile` with the existing profile endpoint. No separate endpoint needed.

---

### API Endpoints

**Strava**
- `GET /strava/auth-url` → returns the Strava authorization URL; frontend redirects the user there
- `GET /strava/callback?code=…` → exchanges code for tokens, stores encrypted, redirects to `/#/profile?strava=connected`
- `POST /strava/fetch` → triggers activity fetch for configured date range, populates `pending_imports`; returns `{ queued: N }` immediately; actual fetch runs in background
- `DELETE /strava/disconnect` → removes Strava tokens from `user_settings`

**Apple Health**
- `POST /apple-health/upload` → multipart upload; writes to temp, starts background parse task; returns `{ task_id }`
- `GET /apple-health/status/{task_id}` → parse progress: `{ status, workouts_staged, metrics_saved, errors }`

**Import queue**
- `GET /imports/pending` → list of staged import rows with mapped session preview
- `POST /imports/{id}/accept` → commit as a real session; returns 409 on duplicate
- `POST /imports/{id}/accept?force=true` → commit despite duplicate warning
- `POST /imports/{id}/discard` → mark discarded, remove from queue
- `POST /imports/accept-all` → accept all pending (background); returns `{ accepted, skipped_duplicates }`
- `PATCH /imports/{id}` → update mapped_session fields before accepting (date, activity type, title)

**Health analytics**
- `GET /analytics/health-metrics?days=90` → returns daily resting_hr, hrv, weight, sleep, vo2_max for the requested period

---

### AI Context Enrichment

When any AI endpoint is called, the backend queries `body_metrics` across three time windows and computes 7-day averages for each. This gives the AI trend context — not just the current state, but whether things are improving or declining. Only metrics enabled in the user's preferences are included.

The block is formatted as a compact comparison table:
```
Health metrics (weekly averages):
                  Now     ~1mo ago   ~3mo ago
Resting HR (bpm)   52        55         58
HRV SDNN (ms)      68        62         55
Sleep (h)          7.3       6.8        7.1
Weight (kg)        64.2      65.1       66.0
```

The three windows:
- **Now** — 7-day average ending today
- **~1mo ago** — 7-day average centred on 1 month ago (days −35 to −28)
- **~3mo ago** — 7-day average centred on 3 months ago (days −97 to −90)

A row is omitted when all three windows have no data for that metric, or when the metric is disabled. The entire block is omitted if no data exists at all. The block is included in the prompt cache region to avoid redundant token costs.

---

### Out of Scope for Phase 15

- Automatic Strava webhook sync (polling-on-demand only)
- GPX route data from Apple Health export
- Sharing body metrics to external services
- Per-segment HR from Strava stream data (avg HR per activity only)
