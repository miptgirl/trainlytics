# Phase 13 — Heart Rate Zones: Requirements

## Goal

Turn HR data into actionable zone-based insight. A user manually enters avg HR and optional time-in-zone data for each cardio session (typically copied from Apple Watch / Apple Health); the app displays a zone donut on session detail, shows avg HR on the history list, and charts weekly time-in-zone trends in Analytics.

The existing per-segment `heart_rate_avg` column is removed — it was never surfaced in the UI and is replaced by cleaner session-level fields.

---

## Zone Model

Fixed Apple Health BPM thresholds — no configuration, no max HR input:

| Zone | BPM range |
|---|---|
| Z1 | < 132 bpm |
| Z2 | 133–144 bpm |
| Z3 | 145–157 bpm |
| Z4 | 158–169 bpm |
| Z5 | ≥ 170 bpm |

These thresholds are display-only constants. They do not drive any computation — zone durations are entered directly by the user.

---

## Scope

### 0. Data Model Changes

**New columns on `workout_sessions`** (Alembic migration):
- `avg_hr_bpm INTEGER NULL` — session average heart rate in bpm; entered by the user.
- `z1_seconds INTEGER NULL`, `z2_seconds INTEGER NULL`, `z3_seconds INTEGER NULL`, `z4_seconds INTEGER NULL`, `z5_seconds INTEGER NULL` — time spent in each HR zone in seconds; entered by the user; all five are optional and independent.

**Removed column** (Alembic migration):
- `cardio_segments.heart_rate_avg` — dropped; was never surfaced in the UI.

Both changes are in a single Alembic migration.

---

### 1. Cardio Log Form: HR Input

Add an optional HR section to the cardio log form (below the segments, above the notes/wellbeing fields).

- **Avg HR** — integer input, labelled "Avg HR (bpm)". Optional.
- **Time in zones** — five duration inputs, one per zone, labelled "Z1 (< 132)", "Z2 (133–144)", "Z3 (145–157)", "Z4 (158–169)", "Z5 (≥ 170)". Same `h:mm:ss` / `m:ss` format and parser as existing duration fields. All five are optional and independent — the user fills in whichever zones Apple Health reported.
- The section is collapsed by default with an "Add HR data" toggle to keep the form tidy on mobile.
- When editing an existing session, any previously saved values are pre-filled.
- Draft auto-save (`localStorage`) includes the HR fields.

---

### 2. Session Detail: HR Zone Distribution

On the cardio session detail view, show a donut chart of time in zone when zone data is present.

- Rendered when at least one zone field (`z1_seconds`–`z5_seconds`) is non-null and non-zero.
- Chart shows each zone as a slice sized by its seconds value; zones with zero/null seconds are omitted from the donut (not shown as empty slices).
- Each slice tooltip: zone label, BPM range, duration (formatted as `h:mm:ss`), and % of total zone time recorded.
- Legend: Z1–Z5 color blocks with BPM range labels.
- If `avg_hr_bpm` is set, display it as a single stat ("Avg HR: 143 bpm") in the same section header or alongside the chart.
- Section is hidden entirely when all zone fields are null/zero and `avg_hr_bpm` is null.

Zone colors (consistent throughout the app):
- Z1 `#60a5fa` (blue-400), Z2 `#34d399` (emerald-400), Z3 `#fbbf24` (amber-400), Z4 `#fb923c` (orange-400), Z5 `#f87171` (red-400).

---

### 3. History List: Avg HR Badge

On the History screen (Stats → History), show avg HR for cardio sessions where `avg_hr_bpm` is set.

- Displayed as an integer, e.g. "143 bpm", with a heart icon.
- Matches the visual style of existing stat chips (distance, pace, duration).
- Only shown when `avg_hr_bpm` is non-null. Sessions without it: no badge, existing stats unchanged.
- Strength sessions: no HR badge.
- Read directly from `workout_sessions.avg_hr_bpm` — no computation.

---

### 4. Analytics: Time-in-Zone Trends Chart

New chart in the Analytics sub-tab (inside the Cardio section) showing weekly zone distribution over the last 12 weeks.

- Stacked bar chart, one bar per week (last 12 complete Mon–Sun weeks + current in-progress week).
- Each bar segment = total minutes in that zone across all cardio sessions in the week (sum `z{n}_seconds / 60` across sessions with non-null values).
- Weeks with no HR data: bar absent or rendered as zero.
- Toggle above the chart: **Minutes** | **%** — switches between absolute minutes and normalized (% of total zone time; bars full height when data present).
- Color coding: same Z1–Z5 scheme as session detail.
- Tooltip per bar: all five zones with minutes and % breakdown.
- `?debug=true` support (same pattern as all other `/analytics/*` endpoints).
- New backend endpoint: `GET /analytics/cardio/hr-zone-trends` returning `[{week_start, z1_minutes, z2_minutes, z3_minutes, z4_minutes, z5_minutes}]`.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Zone model | Fixed Apple Health BPM thresholds | No configuration needed; matches the user's Apple Watch |
| HR data granularity | Session level (avg HR + zone times), not segment level | A segment can span multiple zones; Apple Health reports per-session zone data |
| Zone time entry | User-entered, same `h:mm:ss` format as durations | Copied from Apple Health; no computation needed |
| Remove `heart_rate_avg` from segments | Yes — migration drops the column | Was never surfaced in the UI; replaced by the cleaner session-level model |
| Zone input UX | Collapsed "Add HR data" toggle in log form | Keeps mobile form tidy for sessions where user doesn't have HR data |
| Zone donut — missing zones | Omit zero/null slices | Avoids showing grey "empty" slices for zones never entered |
| Analytics toggle | Absolute minutes + % toggle | Absolute shows volume; % shows distribution shifts |

---

## Out of Scope for Phase 13

- Max HR configuration in Profile
- Per-user custom zone thresholds
- Computed zone classification from per-segment HR
- HR data for strength sessions
- Real-time HR tracking during logging
- HR data import from Strava or Apple Health (Phase 15)
