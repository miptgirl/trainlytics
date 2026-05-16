# Phase 10 — Deep Analytics: Plan

## Task Groups

---

### Group 1 — Backend: Analytics Endpoints (Core) ✅

1.1 Add `GET /analytics/summary` — query `workout_sessions` for: total session count, sum of `duration` in minutes (strength + cardio), sum of cardio segment distances in km; return `{ total_sessions, total_minutes, total_distance_km }`  
1.2 Add `GET /analytics/strength/progression?exercise_id=<id>` — for each strength session that contains the given exercise, return `(date, max_weight, total_volume)`; order by date ascending; backed by a join across `workout_sessions → exercises → sets`  
1.3 Add `GET /analytics/strength/records` — compute all-time PRs per `(exercise_id, type_tag)`: heaviest single-set weight, most reps at heaviest weight, best single-set volume; group output by type tag; exercises with no type tags appear under an `"untagged"` group  
1.4 Add `GET /analytics/strength/volume-by-tag?weeks=<n>` — weekly total volume (kg × reps) per exercise type tag for the last N weeks (default 12); return `{ week_start, tag, total_volume }[]`  
1.5 Add `GET /analytics/cardio/time-split?period=<days>` — total cardio minutes per activity type for the last N days (default 90); return `{ activity_type, total_minutes }[]`  
1.6 Add `GET /analytics/cardio/walk-segments` — for every cardio session, count segments where `activity_type` name matches "walk" (case-insensitive); return `(date, session_title, walk_segment_count)[]` ordered by date; sessions with no walk segments contribute `walk_segment_count: 0`  
1.7 Add `GET /analytics/cardio/distance-progression` — rolling monthly cumulative distance per activity type; for each activity type with at least one session with distance > 0, return monthly data points using a 30-day rolling window ending at each month boundary  
1.8 Add `GET /analytics/training-load` — rolling 4-week and 8-week load windows; return two series: `{ window: 4 | 8, data: { week_start, total_minutes, total_distance_km }[] }`  
1.9 Add `GET /analytics/readiness/trends` — weekly average `wellbeing` and average `rpe` across all sessions (null values excluded from averages); return `{ week_start, avg_wellbeing, avg_rpe }[]`  
1.10 Add `GET /analytics/readiness/correlation` — return per-session `(date, wellbeing, rpe, type)` tuples; exclude any session where `wellbeing` or `rpe` is null  
1.11 Add `GET /analytics/heatmap` — return `{ date, session_types: ("strength" | "cardio")[] }[]` for every date in the last 365 days that has at least one session; dates with no sessions are omitted  

---

### Group 2 — Backend: Training Trends Fix & Wiring ✅

2.1 Extend `GET /sessions/training-trends` — add `skip_empty_weeks` boolean query param (default `true`); when true, weeks with zero sessions (both strength and cardio minutes = 0) are excluded from the response  
2.2 Register all `/analytics/*` routes in a new `app/api/analytics.py` router; mount in `app/main.py`  
2.3 Add Pydantic response schemas in `app/schemas/analytics.py` for all new endpoints  

---

### Group 3 — Backend: Tests ✅

3.1 Add `tests/test_analytics.py` — cover each new endpoint:
  - `summary`: no sessions → zeros; sessions of each type → correct totals
  - `strength/progression`: exercise not found → empty list; sessions logged → correct per-session weight/volume
  - `strength/records`: multiple sets across sessions → correct PRs per type tag; exercise with no tag → appears under `"untagged"`
  - `strength/volume-by-tag`: multi-week data → correct weekly aggregation per tag
  - `cardio/time-split`: multiple activity types → correct minute totals
  - `cardio/walk-segments`: session with walk + run → correct count; session with no walk → `0`; walk-only session → count of walk segments
  - `cardio/distance-progression`: activity type with no distance → excluded
  - `training-load`: correct rolling window aggregation for both 4 and 8 weeks
  - `readiness/trends`: null wellbeing/rpe rows excluded from averages
  - `readiness/correlation`: null rows excluded; returned tuples correct
  - `heatmap`: single-type day → one entry; dual-type day → both types in array; dates with no sessions → omitted
3.2 Extend `test_sessions.py` — add test for `skip_empty_weeks=true/false` on `GET /sessions/training-trends`

---

### Group 4 — Frontend: Analytics Page Shell & Nav ✅

4.1 Create `src/pages/AnalyticsPage.tsx` — top-level layout with section headings: *All-time Summary*, *Strength*, *Cardio*, *Readiness*, *Consistency*; sections render in order, each in a card  
4.2 Add `/analytics` route in `App.tsx`  
4.3 Add "Analytics" link to the main nav bar  
4.4 Create `src/lib/analyticsApi.ts` — typed React Query hooks for all `/analytics/*` endpoints  

---

### Group 5 — Frontend: All-time Summary Header ✅

5.1 Fetch `GET /analytics/summary` on page load  
5.2 Render a three-stat header row: *Total time* (formatted as `Xh Ym`), *Sessions logged*, *Distance run* (km, 1 decimal); loading skeleton shown while fetching  

---

### Group 6 — Frontend: Strength Analytics ✅

6.1 Create `src/components/analytics/ExerciseProgressionChart.tsx` — exercise selector dropdown (all exercises); line chart of `max_weight` over time with volume as a secondary toggleable series; PR data points highlighted with a marker  
6.2 Create `src/components/analytics/PersonalRecordsPanel.tsx` — grouped by exercise type tag; each tag section lists exercises with their three PR values (heaviest, best reps, best volume); `"untagged"` group shown last  
6.3 Create `src/components/analytics/StrengthVolumeBreakdown.tsx` — stacked bar chart of weekly volume per exercise type tag; last 12 weeks; uses Recharts `<BarChart>` with one `<Bar>` per tag  
6.4 Compose Group 5 components into `AnalyticsPage.tsx` under the *Strength* section  

---

### Group 7 — Frontend: Cardio Analytics ✅

7.1 Create `src/components/analytics/ActivityTimeSplitChart.tsx` — bar or pie chart (user-togglable) of total cardio minutes per activity type; period selector: 30 / 90 / 180 / all-time days  
7.2 Create `src/components/analytics/WalkSegmentsTrendChart.tsx` — bar chart of walk segment count per run session over time; zero-count sessions shown as empty bars; x-axis is date  
7.3 Create `src/components/analytics/CardioDistanceProgressionChart.tsx` — line chart per activity type of rolling monthly cumulative distance; one series per activity type; legend toggles individual series  
7.4 Create `src/components/analytics/TrainingLoadChart.tsx` — two line series (4-week rolling, 8-week rolling) of total training minutes; secondary axis for total distance; toggle between minutes and distance  
7.5 Compose Group 6 components into `AnalyticsPage.tsx` under the *Cardio* section  

---

### Group 8 — Frontend: Readiness Analytics ✅

8.1 Create `src/components/analytics/ReadinessTrendsChart.tsx` — dual-line chart; primary line: avg weekly wellbeing (scale 1–5); secondary line: avg weekly RPE (scale 1–5); x-axis is week start date; weeks with no data are gaps (not zero)  
8.2 Create `src/components/analytics/WellbeingCorrelationChart.tsx` — scatter chart; x-axis: pre-training wellbeing; y-axis: post-session RPE; each point is one session; colour-coded by session type (strength vs. cardio); linear trend line overlay; filter toggle for session type  
8.3 Compose into `AnalyticsPage.tsx` under the *Readiness* section  

---

### Group 9 — Frontend: Consistency Heatmap

9.1 Create `src/components/analytics/ConsistencyHeatmap.tsx`:
  - GitHub-style calendar grid of the last 365 days (Mon–Sun columns, week rows)
  - Each day cell colour: rest (empty/grey), strength only, cardio only, both (diagonal split — CSS `linear-gradient` with two colour stops at 50%)
  - Tooltip on hover: date, session types logged
  - Below the grid: *Current streak* (consecutive days with ≥1 session ending today) and *Longest streak* (all-time); computed client-side from heatmap data
9.2 Compose into `AnalyticsPage.tsx` under the *Consistency* section  

---

### Group 10 — History Screen Fix

10.1 Update `GET /sessions/training-trends` call in `src/pages/HistoryPage.tsx` (or equivalent) to pass `skip_empty_weeks=true`; no visual change expected — empty-week bars simply disappear  

---

### Group 11 — Final QA & Polish

11.1 Verify all charts render correctly with a sparse dataset (few sessions) and a dense dataset  
11.2 Verify all charts show a sensible empty state (friendly message, no broken axes) when there is no data for a given metric  
11.3 Mobile responsive check — Analytics page scrolls cleanly on iPhone-sized viewport; no horizontal overflow; chart widths respect container bounds (use `<ResponsiveContainer>` throughout)  
11.4 Verify nav bar does not overflow on mobile with the new "Analytics" item  
