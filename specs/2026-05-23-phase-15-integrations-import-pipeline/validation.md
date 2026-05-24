# Phase 15 — Integrations: Import Pipeline
## Validation

### Progress

| Task Group | Status |
|---|---|
| 1. Database & Environment Setup | ✅ Done — migration `bdc9905e1b7f` applied 2026-05-23 |
| 2. Strava OAuth & Token Management | ✅ Done |
| 3. Strava Activity Fetch & Mapping | ✅ Done |
| 4. Apple Health XML Parser | ✅ Done |
| 5. Import Review Queue (Backend) | ✅ Done |
| 6. Import Review Queue (Frontend) | ✅ Done |
| 7. Strava Profile UI | ⬜ Not started |
| 8. Apple Health Profile UI | ⬜ Not started |
| 9. Health Analytics Section | ⬜ Not started |
| 10. AI Context Enrichment | ⬜ Not started |
| 11. Tests | ⬜ Not started |

---

### Definition of Done

Phase 15 is complete when all of the following are true:

1. A user can connect their Strava account from Profile, configure a sync start date, and fetch recent activities that appear as staged imports in a review queue.
2. A user can upload an Apple Health export zip and have workouts staged alongside Strava imports; resting HR, HRV, weight, and sleep data appear in a new Analytics section.
3. The review queue lets the user accept (optionally editing title/date/type), discard, or Accept All each staged import; accepted imports appear in History exactly as if logged manually.
4. Deduplication warns on accept when a session with the same date and similar duration already exists; the user can override.
5. The user can configure which health metrics (Resting HR, HRV, Body Weight, Sleep, VO2 Max, Active Energy) are tracked; disabled metrics are skipped during import and hidden in Analytics and AI prompts.
6. The AI weekly insights and adapt-session prompts include a health metrics trend table comparing this week's averages against ~1 month ago and ~3 months ago, for all enabled metrics with data.
7. All new backend endpoints are covered by pytest tests; core import and parser logic has unit test coverage.

---

### Automated Tests

Run the full test suite before marking any task group done:

```bash
docker compose exec backend uv run pytest -x -q
```

Key test modules to verify:

| Test file | What it covers |
|---|---|
| `tests/test_strava.py` | OAuth helpers, activity mapping, lap→segment, env-var guard |
| `tests/test_apple_health.py` | Parser for each record type, sleep aggregation, unknown types |
| `tests/test_imports.py` | Queue accept/discard/force, deduplication 409, PATCH update |
| `tests/test_health_analytics.py` | Health metrics endpoint, null handling |
| `tests/test_ai_context.py` | Health block in prompt, absent when no data |

Frontend tests:

```bash
cd frontend && pnpm test --run
```

Verify `ImportRow` component renders and handles accept/409/discard flows.

---

### Manual Validation — Local Deployment

Prerequisites: app running via `docker compose up --build` with Alembic migrations applied.

#### A. Strava OAuth

1. Add `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI` to `.env` (use a personal Strava app created at [strava.com/settings/api](https://www.strava.com/settings/api)); set redirect URI to `http://localhost:8000/strava/callback`.
2. Open Profile → Connections. Confirm "Connect Strava" button is visible.
3. Click "Connect Strava" → browser redirects to Strava authorization page. Authorize.
4. Confirm redirect back to `/#/profile?strava=connected` and that the connected state shows the Strava athlete name and "Never" for last synced.
5. Confirm that removing `STRAVA_CLIENT_ID` from `.env` and restarting makes the Connect button disappear.

#### B. Strava Fetch & Review Queue

1. Set sync start date to one month ago. Click "Sync now".
2. Confirm spinner appears, then "Queued X activities for review" toast.
3. Scroll to the Imports section in Profile. Confirm staged rows appear with source badge "Strava", activity type, date, duration, distance.
4. Expand one row — confirm the session preview shows segments (laps) with individual distances and durations.
5. Edit a row's title inline. Confirm the updated title persists on refresh.
6. Accept one row. Confirm it disappears from the import list and appears in History with correct stats.
7. Re-sync: confirm previously accepted activities are not re-staged.

#### C. Deduplication

1. Log a manual cardio session for today's date with a specific duration (e.g. 45:00).
2. Create a fake pending import for the same date and a duration within ±60 seconds (e.g. 44:45); insert directly via DB if needed, or accept a Strava activity that matches.
3. Click Accept on the import. Confirm a 409 warning appears: "Possible duplicate of [session name] on [date] — accept anyway?"
4. Click "Accept anyway". Confirm the session is created (two sessions now exist for that date).

#### D. Apple Health Upload

1. Export Apple Health data from iPhone: Health app → profile avatar → Export All Health Data → share the zip to your Mac.
2. Open Profile → Apple Health → drag the zip into the upload zone.
3. Confirm upload progress bar appears, then "Parsing…" status.
4. After completion: confirm "X workouts staged for review · Y health metric days imported" message.
5. Check Analytics → Health section. Confirm resting HR, HRV, weight, and sleep charts show data for the imported period.
6. Check Imports section: Apple Health workouts appear alongside any Strava imports.

#### E. Import Review — Accept All

1. With multiple pending imports visible, click "Accept All".
2. Confirm a progress indicator (or immediate count) appears.
3. If any duplicates were detected, confirm a summary: "X accepted, Y conflicts to review".
4. Remaining rows in the list should be only the conflict items.

#### F. AI Context Enrichment

1. With Apple Health data imported spanning at least 3 months, click "Analyse this week" on the History screen.
2. Open the AI request log viewer in Profile → Debug. Expand the most recent `weekly-insights` call.
3. Confirm the full prompt includes a health metrics block formatted as a comparison table with three columns (Now / ~1mo ago / ~3mo ago) and rows for each enabled metric.
4. Verify the values are plausible weekly averages (not raw daily values or totals).
5. Disable "HRV" in Profile → Apple Health metric preferences. Re-trigger. Confirm the HRV row is absent from the table.
6. Remove all `body_metrics` rows via DB (`DELETE FROM body_metrics;`) and re-trigger. Confirm the entire health block is absent from the prompt.

#### G. Disconnect Strava

1. Click "Disconnect" in Profile → Connections. Confirm the confirmation prompt.
2. Confirm the connected state is replaced by the "Connect Strava" button.
3. Confirm `strava_access_token` and `strava_refresh_token` are null in the DB.

---

### Special Testing Scenarios

#### Large Apple Health export
- Test with an export zip larger than 50 MB (real export from a long-time Apple Health user, or a synthetically large XML).
- Confirm the server does not crash or run out of memory; parsing completes and stages the correct number of workouts.
- Confirm the temp file is deleted after parsing.

#### Token refresh
- Set `strava_token_expires_at` to a past timestamp in the DB.
- Trigger "Sync now".
- Confirm the backend refreshes the token silently and the fetch succeeds; updated `strava_token_expires_at` is stored.

#### Unknown Strava activity type
- Insert a `pending_imports` row (or trigger a fetch for) an activity with a Strava type not in the mapping table (e.g. `VirtualRide`).
- Confirm the import row in the queue shows the raw type name and a prompt to select a Trainlytics activity type before accepting.
- Select an existing type and accept. Confirm the session is created with that type.

#### Strava env vars not configured
- Remove `STRAVA_CLIENT_ID` from `.env` and restart backend.
- Confirm `GET /strava/auth-url` returns 503.
- Confirm the Strava section is hidden entirely in Profile UI (not just disabled).

#### Concurrent parse tasks
- Upload two Apple Health zips back-to-back without waiting for the first to finish.
- Confirm both tasks are tracked independently and both complete without corrupting each other's temp files.

#### Re-import / upsert behavior
- Upload the same Apple Health zip twice.
- Confirm `body_metrics` rows are upserted (not doubled) and `pending_imports` rows for the same workouts are not re-created (idempotent by `external_id`).
