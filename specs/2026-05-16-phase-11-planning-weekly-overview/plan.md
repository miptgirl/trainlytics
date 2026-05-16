# Phase 11 — Planning & Weekly Overview: Plan

## Task Groups

---

### Group 1 — Backend: Data Model & Migrations ✅

1.1 Create `app/models/plan.py` — define three SQLAlchemy models:
  - `WeeklyPlan`: `id`, `user_id` (FK), `week_start` (Date), `created_at`; unique constraint `(user_id, week_start)`
  - `PlannedSession`: `id`, `plan_id` (FK, cascade delete), `planned_date` (Date), `session_type` (Enum `strength`/`cardio`), `template_id` (FK nullable), `title`, `notes`, `skip_note`, `display_order`
  - `PlannedCardioSegment`: `id`, `planned_session_id` (FK, cascade delete), `segment_order`, `title`, `activity_type_id` (FK), `duration_secs`, `distance_metres`, `pace_secs_per_km`, `notes`

1.2 Import new models in `app/models/__init__.py` so Alembic detects them

1.3 Generate Alembic migration: `alembic revision --autogenerate -m "add_weekly_plans"`; verify generated SQL creates all three tables with correct constraints

---

### Group 2 — Backend: Plan CRUD Endpoints ✅

2.1 Create `app/api/plans.py` router; mount it at `/plans` in `app/main.py`

2.2 Implement `GET /plans/{week_start}`:
  - Parse `week_start` as a date; reject if not a Monday (400 error)
  - Upsert an empty `WeeklyPlan` for the user + week_start (get-or-create)
  - Load all `PlannedSession` rows for the plan, each with their `PlannedCardioSegment` rows (ordered by `segment_order`)
  - For each planned session, compute `status` by joining `workout_sessions`:
    - Strength: `status = done` if any session on `planned_date` has `template_id` matching; else check date vs today for `planned`/`skipped`
    - Cardio: `status = done` if any cardio session on `planned_date` has a segment with `activity_type_id` matching the first `planned_cardio_segment.activity_type_id`; else same date check
  - Return `{ plan_id, week_start, sessions: [...] }` with status + matched_session_id (nullable) per session

2.3 Implement `POST /plans/{week_start}/sessions`:
  - Body: `{ planned_date, session_type, template_id?, title?, notes?, display_order?, segments?: [...] }`
  - For strength: `template_id` required; auto-fill `title` from template name if not provided
  - For cardio: at least one segment required; each segment has `activity_type_id`, optional `duration_secs`, `distance_metres`, `pace_secs_per_km`, `title`, `notes`
  - Insert `PlannedSession` + `PlannedCardioSegment` rows; return created session with computed status

2.4 Implement `PUT /plans/{week_start}/sessions/{session_id}`:
  - Accept same body as POST; replace existing segments (delete + re-insert) for cardio
  - Return updated session with computed status

2.5 Implement `DELETE /plans/{week_start}/sessions/{session_id}`:
  - Delete the `PlannedSession` (cascades to segments); return 204

2.6 Implement `PATCH /plans/{week_start}/sessions/{session_id}/skip-note`:
  - Body: `{ skip_note: string | null }`; update `PlannedSession.skip_note`; return 200

2.7 Implement `POST /plans/{week_start}/copy-from-last-week`:
  - Compute `prev_week_start = week_start - 7 days`
  - Load all planned sessions (with segments) from `prev_week_start`
  - For each, compute the equivalent date in the current week (`prev_date + 7 days`)
  - If the current week already has sessions, return 409 with message "Week already has a plan"
  - Insert cloned sessions + segments (new IDs, skip_note cleared, display_order preserved)
  - Return same response shape as `GET /plans/{week_start}`

---

### Group 3 — Backend: Pydantic Schemas ✅

3.1 Create `app/schemas/plan.py`:
  - `PlannedCardioSegmentIn` / `PlannedCardioSegmentOut`
  - `PlannedSessionIn` / `PlannedSessionOut` (includes `status: Literal["planned", "done", "skipped"]`, `matched_session_id: int | None`)
  - `WeekPlanOut` (includes `plan_id`, `week_start`, `sessions: list[PlannedSessionOut]`)
  - `SkipNoteIn`
  - `CopyFromLastWeekOut` (same as `WeekPlanOut`)

---

### Group 4 — Backend: AI Cardio Adapt Endpoint ✅

4.1 Add `POST /ai/adapt-cardio-session` to `app/api/ai.py`:
  - Body: `{ planned_session_id: int, complaint: str }`
  - Load the planned session with its segments; return 404 if not found or not owned by current user
  - Format the planned session as a human-readable segment list (activity type, target distance km, duration min, pace min/km)
  - Assemble prompt: athlete context block + 4-week cardio history (using existing `compact_cardio_segments` helper on `workout_sessions`) + planned session + complaint
  - Call LLM via `ai_service.py` (same provider resolution as Phase 9); log the request to `ai_request_logs`
  - Return `{ response: str }` (markdown)

4.2 Update `app/services/ai_service.py`:
  - Add helper `format_planned_cardio_session(session, segments) -> str` for prompt formatting
  - Extend the 4-week history fetcher to optionally filter by `session_type = cardio` for this endpoint

4.3 Update `POST /ai/weekly-insights` prompt assembly:
  - Query skip notes from planned sessions in the current + previous week; append to the history block as `"Skipped [title] on [date]: [note]"` (skip if no skip notes)

---

### Group 5 — Backend: Tests

5.1 Add `tests/test_plans.py`:
  - `GET /plans/{week_start}`: non-Monday date → 400; valid Monday with no plan → empty plan auto-created; planned strength session, matching log → status `done`; day elapsed, no log → status `skipped`; day not yet passed, no log → status `planned`; cardio session matching by primary activity type → status `done`
  - `POST /plans/{week_start}/sessions`: strength session without template_id → 422; cardio session with zero segments → 422; valid strength → created with correct title; valid cardio → created with segments
  - `PUT /plans/{week_start}/sessions/{id}`: update segments → old segments deleted, new ones inserted
  - `DELETE /plans/{week_start}/sessions/{id}`: session deleted, segments cascade deleted; 404 for unknown id
  - `PATCH /plans/{week_start}/sessions/{id}/skip-note`: sets and clears skip note
  - `POST /plans/{week_start}/copy-from-last-week`: empty week → sessions cloned with correct dates; week already has sessions → 409; skip_note not carried over

5.2 Add `tests/test_ai_cardio_adapt.py`:
  - No API key configured → appropriate error response
  - Unknown `planned_session_id` → 404
  - Valid request → LLM called with prompt containing planned session segments and complaint; response logged

---

### Group 6 — Frontend: /plan Route, Nav & API Hooks

6.1 Add `/plan` route in `App.tsx`; create `src/pages/PlanPage.tsx` as the top-level container

6.2 Add "Plan" link to the main nav bar (between History and Analytics)

6.3 Create `src/lib/planApi.ts` — typed React Query hooks:
  - `useWeekPlan(weekStart: string)` → `GET /plans/{week_start}`
  - `useAddPlannedSession()` → `POST /plans/{week_start}/sessions`
  - `useUpdatePlannedSession()` → `PUT /plans/{week_start}/sessions/{id}`
  - `useDeletePlannedSession()` → `DELETE /plans/{week_start}/sessions/{id}`
  - `useUpdateSkipNote()` → `PATCH /plans/{week_start}/sessions/{id}/skip-note`
  - `useCopyFromLastWeek()` → `POST /plans/{week_start}/copy-from-last-week`

6.4 Implement week navigation state in `PlanPage.tsx`:
  - `weekStart` state initialized to the Monday of the current week
  - Prev/next buttons shift by 7 days; display format "May 18 – 24, 2026"

---

### Group 7 — Frontend: Week Grid & Session Display

7.1 Create `src/components/plan/WeekGrid.tsx`:
  - Renders Mon–Sun as sections, each with a date header and a list of `PlannedSessionCard` components
  - "Add session" button below each day's session list
  - Days in the past use a muted style; today's date is highlighted

7.2 Create `src/components/plan/PlannedSessionCard.tsx`:
  - Shows: title, session type badge (Strength / Cardio), status badge (Planned / Done / Skipped)
  - Cardio sessions: show planned segment summary (e.g. "Run 8 km · Walk 2 km")
  - **Planned / future**: "Start" button (primary), "Reschedule" and "Edit" icon buttons, "Delete" icon button
  - **Done**: "View session →" link to matched session's detail view (no Start / Edit)
  - **Skipped**: "Add note" or inline skip note text, "Reschedule" button, "Swap" button (same as Edit but labeled Swap), "Delete" icon button
  - Delete shows an inline confirmation before calling `useDeletePlannedSession()`

7.3 Create `src/components/plan/SkipNoteModal.tsx`:
  - Simple modal with a textarea for the skip note and Save / Cancel
  - On save, calls `useUpdateSkipNote()`; clears and closes on cancel

7.4 Create `src/components/plan/RescheduleModal.tsx`:
  - Shows a date picker constrained to Mon–Sun of the current week (days already past are disabled)
  - On confirm, calls `useUpdatePlannedSession()` with the new `planned_date`; closes on success

---

### Group 8 — Frontend: Plan Session Form

8.1 Create `src/components/plan/PlanSessionForm.tsx`:
  - Session type toggle: Strength / Cardio
  - Strength fields: template selector (same grouped dropdown as log form), optional title override, optional notes
  - Cardio fields: segment list (add/remove/reorder); each segment has: activity type selector, title, target duration (`h:mm:ss` input), target distance (km), pace (auto-calculated, overridable), notes
  - Reuse `TimeInput` component (or equivalent) from the cardio log form for duration/pace fields
  - Date picker (within the current week) to set `planned_date`
  - Submit adds or updates the planned session; form resets on close

8.2 Wrap `PlanSessionForm.tsx` in a modal; open it from:
  - "Add session" button → new session, date pre-set to that day
  - Edit / Swap button on `PlannedSessionCard` → pre-filled with existing session data; session type toggle disabled (can't change type on edit)

---

### Group 9 — Frontend: Start Session from Plan

9.1 In `PlannedSessionCard.tsx`, wire the "Start" button:
  - Strength: navigate to `/log?type=strength&templateId=<template_id>`
  - Cardio: navigate to `/log?type=cardio&plannedSessionId=<planned_session_id>`
  - Button disabled / hidden for past sessions and Done sessions

9.2 In the cardio log form, read `plannedSessionId` from the URL search params on mount:
  - If present, call `GET /plans/{week_start}/sessions/{plannedSessionId}` and inject the returned segments as the initial form state (activity types, durations, distances, paces, titles, notes)
  - If a localStorage draft also exists, show a choice prompt: "Restore saved draft?" vs "Use planned session" vs "Start fresh"
  - After injecting planned session data, the form behaves exactly as if the user had filled it in manually (editable, draft-saving continues normally)

---

### Group 10 — Frontend: Weekly Overview Card & Copy from Last Week

10.1 Create `src/components/plan/WeeklyOverviewCard.tsx`:
  - Displays: Planned N · Done N · Skipped N · Completion N%
  - Completion % = done / (done + skipped) × 100, shown as a progress bar
  - Loading skeleton while `useWeekPlan` is fetching

10.2 Render `WeeklyOverviewCard` at the top of `PlanPage.tsx`, above the week grid

10.3 "Copy from last week" button:
  - Shown below the overview card only when the current week has zero planned sessions
  - On click, calls `useCopyFromLastWeek()`; on success, invalidates `useWeekPlan` query; on 409, shows "This week already has a plan" toast

---

### Group 11 — Frontend: AI Cardio Adapt Modal

11.1 Create `src/components/plan/AdaptCardioModal.tsx`:
  - Same structure as the existing `AdaptSessionModal` used for strength (Phase 9)
  - Textarea for the complaint; submit calls `POST /ai/adapt-cardio-session`; response rendered as markdown
  - Loading spinner + error state + retry button

11.2 In the cardio log form (`src/pages/LogPage.tsx` or equivalent cardio log component):
  - Resolve `planned_session_id` from either: (a) the `?plannedSessionId=` URL param (Start from plan flow), or (b) querying `useWeekPlan(today)` for a planned cardio session whose primary activity type matches the first segment's activity type
  - If resolved, render "Adapt this session" button near the notes field (same placement as in the strength log form)
  - On click, open `AdaptCardioModal` with the resolved `planned_session_id`

---

### Group 12 — Final QA & Polish

12.1 Verify week navigation: prev/next buttons correctly shift the week; correct Monday always computed for "current week"; navigating to past weeks shows historical status correctly

12.2 Verify auto-matching: log a strength session from a template on a planned day → card flips to Done with link; log a cardio run on a planned run day → card flips to Done; previous day with no match → shows Skipped

12.3 Verify skip notes: add a skip note → saves and displays; edit note → updates; clear note → removed

12.4 Verify "Copy from last week": copies sessions and segments; skip notes not copied; button disappears after copy; second copy attempt shows correct conflict message

12.5 Verify Start from plan (strength): click "Start" on a strength planned session → log form opens with template pre-selected; session can be committed normally

12.6 Verify Start from plan (cardio): click "Start" on a cardio planned session → log form opens with planned segments pre-filled (activity types, distances, durations, paces); all fields remain editable; draft-recovery prompt appears if a draft also exists

12.7 Verify Reschedule: click "Reschedule" on a Planned or Skipped session → modal shows only future days within the same week; select a day → card moves to the new day; old day is now empty

12.8 Verify Swap: click "Swap" on a Skipped session → form opens pre-filled with existing content; change template or segments → save; card shows updated content with Skipped status retained

12.9 Verify cardio adapt: "Adapt this session" button appears when started from plan (via URL param) and when activity type matches today's plan; modal opens with planned context; suggestion renders as markdown

12.10 Mobile responsive check: Plan page scrolls cleanly on iPhone viewport; session cards do not overflow; Reschedule modal, Skip note modal, and plan session form modal all scroll correctly on small screens; nav bar does not overflow with new "Plan" tab
