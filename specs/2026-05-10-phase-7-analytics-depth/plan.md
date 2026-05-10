# Phase 7 — Analytics Depth: Plan

Numbered task groups in dependency order. Groups 1–2 are backend; groups 3–5 are frontend. Groups 3 and 4 can start in parallel once their respective backend group is done.

---

## 1. Backend — Pace Trends Endpoint ✅

1.1 Add `GET /sessions/pace-trends` route in `backend/app/api/sessions.py`  
1.2 Write the aggregation query in `backend/app/services/` — group cardio segments by week bucket and segment position, compute average pace per bucket, filter by activity type  
1.3 Add Pydantic response schema: `PaceTrendPoint` (week_start, activity_type, segment_label, avg_pace_sec_per_km)  
1.4 Write pytest tests for the endpoint (empty state, single activity type, multiple types, segment breakdown)

---

## 2. Backend — Step Tracking ✅

2.1 Create `DailySteps` SQLAlchemy model in `backend/app/models/` (`id`, `user_id`, `date`, `steps`, `created_at`, `updated_at`)  
2.2 Generate and apply Alembic migration  
2.3 Add `POST /steps` route — upsert (insert or update) for the given date  
2.4 Add `GET /steps` route — return entries for a date range, ordered by date descending  
2.5 Add Pydantic schemas: `StepEntryCreate`, `StepEntryResponse`  
2.6 Write pytest tests (create, update existing date, fetch range, empty range)

---

## 3. Frontend — Pace Trends Chart ✅

3.1 Create `usePaceTrends` React Query hook calling `GET /sessions/pace-trends`  
3.2 Build `PaceTrendsChart` component using Recharts `LineChart` — one line per (activity_type, segment_label) pair  
3.3 Add an activity-type filter control above the chart (checkboxes or pills, same style as existing filters)  
3.4 Add the chart as a new tab on the History screen alongside the training trends chart  
3.5 Handle empty state (no cardio sessions with distance/duration logged)

---

## 4. Frontend — Step Log Screen ✅ 

4.1 Create `/steps` route and `StepsPage` component ✅ — implemented at `frontend/src/pages/StepsPage.tsx`
4.2 Add a link to Steps in the Settings tab (alongside Manage Activity Types and Manage Exercises) ✅ — link added in `frontend/src/pages/SettingsPage.tsx`
4.3 Build step entry form: date picker + steps integer input, submits via `POST /steps` ✅ — form wired to `useUpsertStep` in `frontend/src/lib/hooks/useSteps.ts`
4.4 Display recent entries list with date and step count; tapping an entry pre-fills the form for editing ✅ — list uses `useSteps` and pre-fills the form on edit
4.5 Add `useSteps` and `useUpsertStep` React Query hooks ✅ — implemented at `frontend/src/lib/hooks/useSteps.ts`

---

## 5. Frontend — Step Overlay on Training Trends Chart

5.1 Extend `useTrainingTrends` (or add a parallel fetch) to also load step data for the same 12-week window  
5.2 Add a secondary right-side y-axis to the existing training trends `AreaChart`  
5.3 Render step totals as a `Line` on the secondary axis, styled distinctly (dashed or dotted, neutral colour)  
5.4 Handle weeks with no step data (gap in line vs. zero — use gap)
