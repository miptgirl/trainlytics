# Phase 13 — Implementation Plan

## Status

| Group | Status | Notes |
|---|---|---|
| Group 1 — DB Migration & Schema | ✅ Done | |
| Group 2 — Cardio Log Form: HR Input | ✅ Done | |
| Group 3 — Session Detail: HR Zone Donut | ⬜ Not started | |
| Group 4 — History List: Avg HR Badge | ⬜ Not started | |
| Group 5 — Analytics: hr-zone-trends Endpoint | ⬜ Not started | |
| Group 6 — Analytics: HR Zone Trends Chart (Frontend) | ⬜ Not started | |
| Group 7 — Tests & Cleanup | ⬜ Not started | |

---

Each group is a discrete unit of work. Groups 2–5 depend on Group 1. Groups 3, 4, and 5 can run in parallel once Group 1 is done. Group 6 depends on Group 5.

---

## Group 1 — DB Migration & Schema (Backend)

Files: `backend/alembic/versions/` (new migration), `backend/app/models/session.py`, `backend/app/schemas/sessions.py`, `backend/app/schemas/analytics.py`

1.1 **Alembic migration**
- Drop `cardio_segments.heart_rate_avg` column.
- Add to `workout_sessions`: `avg_hr_bpm INTEGER NULL`, `z1_seconds INTEGER NULL`, `z2_seconds INTEGER NULL`, `z3_seconds INTEGER NULL`, `z4_seconds INTEGER NULL`, `z5_seconds INTEGER NULL`.
- Single migration file; no data backfill needed.

1.2 **Update `WorkoutSession` SQLAlchemy model**
- Remove `heart_rate_avg` from `CardioSegment`.
- Add `avg_hr_bpm`, `z1_seconds`, `z2_seconds`, `z3_seconds`, `z4_seconds`, `z5_seconds` to `WorkoutSession` (all `Integer`, nullable).

1.3 **Update session Pydantic schemas**
- `CardioSegmentCreate` / `CardioSegmentRead`: remove `heart_rate_avg`.
- `WorkoutSessionCreate` / `WorkoutSessionUpdate`: add `avg_hr_bpm: int | None` and `z1_seconds: int | None` … `z5_seconds: int | None`.
- `WorkoutSessionRead` (detail response): expose all six new fields.
- `WorkoutSessionListItem` (list response): expose `avg_hr_bpm: int | None` only (zone seconds not needed in list view).

1.4 **Add zone constants**
- New file `backend/app/services/hr_zones.py`.
- Module-level constant `HR_ZONES` listing the five zones with label and BPM bounds:
  ```python
  HR_ZONES = [
      {"label": "Z1", "min_bpm": None, "max_bpm": 132},
      {"label": "Z2", "min_bpm": 133, "max_bpm": 144},
      {"label": "Z3", "min_bpm": 145, "max_bpm": 157},
      {"label": "Z4", "min_bpm": 158, "max_bpm": 169},
      {"label": "Z5", "min_bpm": 170, "max_bpm": None},
  ]
  ```
- No computation functions needed — zones are stored, not derived.

---

## Group 2 — Cardio Log Form: HR Input (Frontend)

Dependencies: Group 1

File: `frontend/src/pages/LogPage.tsx` (or wherever the cardio form lives), possibly a new `HrInputSection.tsx` component

2.1 **`HrInputSection` component**
- A collapsible section with a toggle button labelled "Add HR data".
- When expanded, shows:
  - **Avg HR** — integer input, placeholder "bpm".
  - **Zone durations** — five rows labelled "Z1 (< 132)", "Z2 (133–144)", "Z3 (145–157)", "Z4 (158–169)", "Z5 (≥ 170)", each using the existing `h:mm:ss` / `m:ss` duration input component.
- Collapsed by default on a fresh session.
- Auto-expanded when any HR field has a non-null value (i.e. when editing an existing session with HR data).

2.2 **Wire into cardio log form**
- Add `<HrInputSection>` below the last segment and above the notes field.
- Bind `avg_hr_bpm` and `z1_seconds`–`z5_seconds` to form state (React Hook Form).
- Duration inputs: convert `h:mm:ss` string → seconds before submitting (same conversion as existing duration fields).
- On submit, include all six fields in the `POST /sessions` or `PATCH /sessions/:id` payload (null when empty).

2.3 **Draft auto-save**
- Include `avg_hr_bpm` and zone seconds in the `localStorage` draft.
- On draft restore, expand the HR section if any HR field is non-null.

---

## Group 3 — Session Detail: HR Zone Donut (Frontend)

Dependencies: Group 1

Files: session detail page component, new `frontend/src/components/HrZoneDonut.tsx`

3.1 **`HrZoneDonut` component**
- Props: `avgHrBpm: number | null`, `zones: { z1: number | null, z2: number | null, z3: number | null, z4: number | null, z5: number | null }` (seconds).
- Renders a Recharts `PieChart` / `Pie` (donut, `innerRadius` set). Slices: only zones where seconds > 0.
- Zone colors: Z1 `#60a5fa`, Z2 `#34d399`, Z3 `#fbbf24`, Z4 `#fb923c`, Z5 `#f87171`.
- Tooltip per slice: zone label, BPM range, duration formatted as `h:mm:ss`, % of total recorded zone time.
- Legend below: Z1–Z5 color blocks with BPM range.
- If `avgHrBpm` is non-null, show "Avg HR: {n} bpm" as a heading or stat above the donut.

3.2 **Integrate into session detail view**
- In the cardio session detail page, add an "HR Zone Distribution" section below the segments table.
- Render `<HrZoneDonut>` when `avg_hr_bpm` is non-null OR at least one zone field is non-null and non-zero.
- When neither condition is met: section hidden entirely.
- Strength session detail: section absent.

---

## Group 4 — History List: Avg HR Badge (Frontend)

Dependencies: Group 1

File: history list component (wherever session rows are rendered in the Stats → History sub-tab)

4.1 **Add avg HR to session row**
- Read `avg_hr_bpm` from the session list API response (already included via schema change in Group 1).
- For cardio sessions with a non-null `avg_hr_bpm`: render a heart icon + "{n} bpm" alongside existing stat chips (distance, pace, duration).
- For sessions with null `avg_hr_bpm` or strength sessions: no change.
- Style: match existing stat chip appearance.

---

## Group 5 — Analytics: hr-zone-trends Endpoint (Backend)

Dependencies: Group 1

File: `backend/app/api/analytics.py`, `backend/app/schemas/analytics.py`

5.1 **New endpoint `GET /analytics/cardio/hr-zone-trends`**
- Returns `[{week_start, z1_minutes, z2_minutes, z3_minutes, z4_minutes, z5_minutes}]` for the last 12 complete Mon–Sun weeks plus the current in-progress week (13 entries max).
- Aggregation: for each cardio session in the week, sum `z{n}_seconds` (treating null as 0) and divide by 60 to get minutes; round to one decimal.
- Weeks with no cardio sessions: included with all zone values as `0.0`.
- `?debug=true` support (wrap response in `{data, debug: {sql}}`).
- Pydantic schema: `HrZoneTrendsRow` with `week_start: date`, `z1_minutes: float`, …, `z5_minutes: float`.
- Register route under `/analytics/cardio/hr-zone-trends`.

---

## Group 6 — Analytics: HR Zone Trends Chart (Frontend)

Dependencies: Group 5

Files: Analytics page / Cardio section component, new `frontend/src/components/HrZoneTrendsChart.tsx`

6.1 **`HrZoneTrendsChart` component**
- Fetches `GET /analytics/cardio/hr-zone-trends`.
- Renders a Recharts `BarChart` (stacked bars) with one bar per week.
- Same Z1–Z5 colors as the donut.
- Toggle control (button group): **Minutes** | **%**.
  - Minutes: Y-axis in minutes; bar segments = `z{n}_minutes`.
  - %: each zone value normalized to `zone / total × 100`; Y-axis 0–100%.
- X-axis: week start labels (same format as existing trends charts).
- Tooltip per bar: all five zones with minutes and % breakdown.
- Zone legend below: Z1–Z5 color blocks with BPM range labels.
- `</>` SQL debug icon in chart header (same pattern as all other analytics charts).

6.2 **Add chart to Cardio section**
- Place `<HrZoneTrendsChart>` as the first item inside the Cardio collapsible section.
- No changes to existing Cardio charts.

---

## Group 7 — Tests & Cleanup

Dependencies: all prior groups

7.1 **Backend: session API tests** (`backend/tests/test_sessions.py`)
- `test_log_cardio_with_hr_data` — POST a cardio session with `avg_hr_bpm` and zone seconds; GET it back and assert all six fields match.
- `test_log_cardio_no_hr_data` — POST without HR fields; assert all six fields are null in the response.
- `test_session_list_includes_avg_hr` — confirm `avg_hr_bpm` appears in list response for a session that has it.
- `test_session_list_no_hr` — confirm `avg_hr_bpm` is null in list response when not set.
- `test_cardio_segment_has_no_heart_rate_avg` — confirm the old column is gone (submit a payload with `heart_rate_avg` and assert it is ignored / not stored).

7.2 **Backend: analytics test** (`backend/tests/test_analytics.py`)
- `test_hr_zone_trends_aggregation` — two sessions in the same week with known zone seconds; assert each zone bucket in the response equals the expected sum / 60.
- `test_hr_zone_trends_null_zones_treated_as_zero` — session with some null zone fields; assert those zones contribute 0 to the total.
- `test_hr_zone_trends_debug_flag` — `?debug=true` returns `{data: [...], debug: {sql: "..."}}`.

7.3 **Run full test suite** — `pytest` (backend) and `vitest` (frontend); confirm no regressions.
- Confirm any existing test that referenced `heart_rate_avg` on segments is updated or removed.
