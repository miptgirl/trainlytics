# Phase 13 — Validation

## Progress

| Area | Status |
|---|---|
| DB migration & schema (drop segment HR, add session-level fields) | ✅ Done |
| Cardio log form: HR input section | ✅ Done |
| Session detail: HR zone donut | ✅ Done |
| History list: avg HR badge | ✅ Done |
| Analytics hr-zone-trends endpoint | ✅ Done |
| Analytics HR zone trends chart (frontend) | ✅ Done |
| Tests & cleanup | ✅ Done |

---

## Definition of Done

A user can:
1. Log a cardio session, expand the "Add HR data" section, enter avg HR and time per zone (copied from Apple Health), and have those values saved.
2. Open the session detail view and see a zone donut chart and avg HR stat.
3. Browse the History list and see "143 bpm" (or similar) on sessions that have avg HR recorded.
4. Open Stats → Analytics → Cardio section and see a weekly time-in-zone chart for the last 12 weeks, toggleable between absolute minutes and percentage.

The old `heart_rate_avg` column on `cardio_segments` is removed with no data loss (it was never used in the UI).

---

## Success Criteria

### Data Model

| Check | Expected |
|---|---|
| `cardio_segments.heart_rate_avg` column | Dropped by migration; does not exist in DB or models |
| `workout_sessions.avg_hr_bpm` | Present, nullable integer |
| `workout_sessions.z1_seconds` … `z5_seconds` | Present, nullable integer (all five) |
| Old column in API payload | Submitting `heart_rate_avg` in a segment payload is ignored (no 422) |

### Log Form: HR Input

| Scenario | Expected |
|---|---|
| Fresh cardio session | HR section collapsed; toggling "Add HR data" expands it |
| Submit with HR data filled | `avg_hr_bpm` and zone seconds saved correctly |
| Submit with HR section untouched | All six fields null in DB |
| Edit existing session with HR | HR section auto-expanded with correct values pre-filled |
| Draft restore with HR data | HR section expanded with saved values |
| Zone duration input | Accepts `h:mm:ss` / `m:ss` format; stored as seconds |

### Session Detail: HR Zone Donut

| Scenario | Expected |
|---|---|
| Session has avg HR + zone data | Section visible; donut shows non-zero zones only; avg HR stat shown |
| Session has avg HR only, no zones | Section visible; avg HR shown; donut hidden or not rendered |
| Session has zone data only, no avg HR | Donut shown; avg HR stat absent |
| No HR data at all | Section hidden entirely |
| Strength session | Section absent |
| Slice tooltip | Shows zone label, BPM range, duration (h:mm:ss), and % |
| Colors | Z1 blue, Z2 green, Z3 amber, Z4 orange, Z5 red — consistent with analytics chart |

### History List: Avg HR Badge

| Scenario | Expected |
|---|---|
| Cardio session with `avg_hr_bpm` | Badge "143 bpm" shown alongside distance/pace/duration |
| Cardio session without avg HR | No badge; existing stats unchanged |
| Strength session | No badge |

### Analytics: HR Zone Trends Chart

| Check | Expected |
|---|---|
| Chart location | First item inside Cardio collapsible section |
| Minutes mode | Y-axis in minutes; bar segments proportional to zone minutes |
| % mode | Each bar normalized to 100%; Y-axis 0–100% |
| Toggle | Switching between Minutes and % updates chart without reload |
| Tooltip | All five zones shown with minutes + % on hover |
| Colors | Z1–Z5 blue→red, matching session detail donut |
| Week with no HR data | Bar absent or zero |
| SQL debug icon | `</>` present; modal shows non-empty SQL |

---

## Manual Validation — Local Deployment

**Prerequisites:** app running via `docker compose up --build` with migrations applied (`alembic upgrade head`).

### 1. Migration

1. Confirm migration runs without error.
2. Connect to the DB and confirm `cardio_segments` has no `heart_rate_avg` column.
3. Confirm `workout_sessions` has `avg_hr_bpm`, `z1_seconds`, `z2_seconds`, `z3_seconds`, `z4_seconds`, `z5_seconds`.

### 2. Log form: HR input

1. Open Log → Cardio. Confirm the HR section is collapsed by default.
2. Click "Add HR data" — confirm the section expands showing Avg HR field and five zone duration inputs labelled Z1–Z5 with BPM ranges.
3. Enter avg HR (e.g. 148) and a few zone durations (e.g. Z2: 5:00, Z3: 20:00, Z4: 8:00).
4. Submit. Open the session detail. Confirm avg HR and zone values are shown correctly.
5. Click Edit on the session. Confirm the HR section is auto-expanded with the correct values pre-filled.
6. Clear all HR fields and save — confirm the session now has no HR data (section hidden in detail view).

### 3. Session detail: HR zone donut

1. Open the session logged above (with HR data).
2. Confirm an "HR Zone Distribution" section appears with "Avg HR: 148 bpm" and a donut chart.
3. Confirm only the zones with non-zero time appear as slices (Z1 should be absent if you didn't enter it).
4. Hover over a slice — confirm tooltip shows zone label, BPM range, formatted duration, and %.
5. Confirm zone colors: Z2 green, Z3 amber, Z4 orange.
6. Open a cardio session with no HR data — confirm the section is hidden.
7. Open a strength session — confirm the section is absent.

### 4. History list: avg HR badge

1. Open Stats → History.
2. Find the session with avg HR data — confirm a badge with a heart icon and "148 bpm" is shown.
3. Find a cardio session with no HR data — confirm no badge.
4. Find a strength session — confirm no badge.

### 5. Analytics: time-in-zone trends

1. Ensure at least 2 cardio sessions in the current week have zone data.
2. Open Stats → Analytics → expand the Cardio section.
3. Confirm the HR Zone Trends chart appears as the first item.
4. Confirm bars show for the current week with the expected zone breakdown.
5. Click **%** — confirm bars normalize and Y-axis shows 0–100%.
6. Click **Minutes** — confirm bars return to absolute values.
7. Hover over the bar — confirm tooltip shows all five zones.
8. Click `</>` — confirm SQL modal opens with a non-empty query.

---

## Testing

### Backend: session API (`backend/tests/test_sessions.py`)

- `test_log_cardio_with_hr_data` — POST session with `avg_hr_bpm=145`, `z2_seconds=600`, `z3_seconds=1200`; GET by id; assert all three values match.
- `test_log_cardio_no_hr_data` — POST without HR fields; assert all six fields null.
- `test_session_list_includes_avg_hr` — assert `avg_hr_bpm` in list response item for a session with it set.
- `test_session_list_no_hr_null` — assert `avg_hr_bpm` is null in list response when not set.
- `test_segment_heart_rate_avg_removed` — POST a segment with `heart_rate_avg` key; assert no 422 and column does not exist in response.

### Backend: analytics (`backend/tests/test_analytics.py`)

- `test_hr_zone_trends_aggregation` — two sessions same week: session A has z2_seconds=600, session B has z2_seconds=300; assert z2_minutes=15.0 in that week's row.
- `test_hr_zone_trends_null_zones_as_zero` — session with z1_seconds=null; assert z1_minutes=0.0.
- `test_hr_zone_trends_debug_flag` — `?debug=true` returns `{data: [...], debug: {sql: "..."}}`.

### Regression checks

- Run `pytest` (backend) and `vitest` (frontend) — no failures.
- Confirm any existing test referencing `heart_rate_avg` on a segment is updated.
- Confirm cardio segment log/edit/detail flows still work correctly without the removed column.
