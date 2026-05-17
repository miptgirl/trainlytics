# Phase 11 — Planning & Weekly Overview: Requirements

## Goal

A user can plan their training week in advance, log against that plan, and see a clear summary of planned vs. completed — enabling intentional, structured training rather than reactive logging.

---

## Scope

### In scope

- **Weekly plan builder** — per-week (not a repeating program); each week starts empty with an optional "Copy from last week" one-tap action
- **Planned sessions** — both strength (from an existing template) and cardio (full segment structure matching the cardio log form: activity type, target distance, duration, pace, notes per segment)
- **Plan route** — new `/plan` top-level tab in the nav bar; dedicated weekly view with prev/next week navigation
- **Auto-matching** — logged sessions are matched to planned ones on read, not persisted:
  - Strength: match if a logged strength session on the same date used the same template
  - Cardio: match if any logged cardio session on the same date contains at least one segment whose activity type matches the planned session's primary activity type (first segment)
- **Three statuses** — `planned` (day not yet passed), `done` (match found), `skipped` (day elapsed, no match)
- **Skip notes** — when a planned session is skipped, the user can add a free-text reason (e.g. "knee pain"); stored per planned session and included as context in future AI calls
- **Swap / reschedule** — any planned session can be swapped (content replaced with a different template or cardio structure) or rescheduled (moved to a different day within the same week); skipped sessions additionally show a "Reschedule" shortcut to quickly move them to a future day
- **Start from plan** — a "Start" button on each planned session card (today and future sessions only) navigates directly to the log form pre-filled with the planned session's data: strength sessions pre-select the template (existing `?templateId=` param); cardio sessions pre-fill all segments via a new `?plannedSessionId=` param; draft-recovery behaviour is preserved
- **Weekly overview card** — top of the Plan page: planned count, completed count, skipped count, completion %; for the displayed week
- **Copy from last week** — one-tap action copies last week's planned sessions (including their segments) into an empty current week
- **Cardio adaptive session helper** — "Adapt this session" button in the cardio log form; when a matching planned cardio session exists for today, sends the planned structure + user free-text complaint to the AI; returns modification suggestions; extends the existing `POST /ai/adapt-session` pattern (Phase 9)

### Out of scope

- Repeating weekly programs / training blocks / multi-week plans
- Push notifications for upcoming planned sessions
- Plan templates (pre-built week structures)
- Adaptive helper for cardio when no plan exists (deferred)

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Planning granularity | Per-week, fresh each week | Real training plans change week to week; a rigid repeating program doesn't match the target user's style |
| Cardio detail level | Full segment structure | Consistent with the log form; gives the AI adapt helper a concrete target to modify |
| Session matching | Auto by date + type (on read, not persisted) | Zero friction; recomputing on GET avoids stale state when sessions are edited or deleted |
| Skipped detection | Auto (day elapsed + no match found) | Immediate, no user action required; user can annotate with a skip note after the fact |
| Week carry-over | "Copy from last week" button on empty week | Balances convenience with intentional re-planning each week |
| Swap vs. reschedule | Both supported | Swap = same day, different content; reschedule = same content, different day; both use the existing PUT endpoint |
| Start from plan | Pre-fill log form via URL param | Strength reuses `?templateId=`; cardio adds `?plannedSessionId=` so the log form fetches and injects planned segments |
| Cardio AI adapt | Included in Phase 11 | Planning layer now provides the "planned target" that was missing in Phase 9 |
| Nav bar | New "Plan" tab | Keeps planning as a first-class surface, not buried inside History |

---

## Data Model

### New tables

#### `weekly_plans`

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | — |
| `user_id` | FK → users | — |
| `week_start` | Date | Monday of the target week (UTC) |
| `created_at` | DateTime (UTC) | — |

Unique constraint: `(user_id, week_start)`.

#### `planned_sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | — |
| `plan_id` | FK → weekly_plans | Cascade delete |
| `planned_date` | Date | Actual calendar date within the week |
| `session_type` | Enum `strength` / `cardio` | — |
| `template_id` | FK → strength_templates, nullable | Strength sessions only |
| `title` | Text, nullable | Auto-filled from template name for strength |
| `notes` | Text, nullable | — |
| `skip_note` | Text, nullable | User-provided reason for skipping; used as AI context |
| `display_order` | Integer | Order within a day when multiple sessions are planned |

#### `planned_cardio_segments`

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | — |
| `planned_session_id` | FK → planned_sessions | Cascade delete |
| `segment_order` | Integer | Order within the planned session |
| `title` | Text, nullable | — |
| `activity_type_id` | FK → activity_types | Determines cardio matching (primary = first segment) |
| `duration_secs` | Integer, nullable | Target duration |
| `distance_metres` | Integer, nullable | Target distance |
| `pace_secs_per_km` | Integer, nullable | Target pace |
| `notes` | Text, nullable | — |

### Matching logic (computed on `GET /plans/{week_start}`, not stored)

For each `planned_session` in the week:

1. Query `workout_sessions` for all sessions on `planned_date` for this user.
2. **Strength**: match if any session has `session_type = strength` and `template_id` equals the planned `template_id`.
3. **Cardio**: match if any session has `session_type = cardio` and contains at least one segment with `activity_type_id` matching the first `planned_cardio_segment`'s `activity_type_id`.
4. **Status**:
   - Match found → `done` (include matched session id)
   - No match, `planned_date >= today` → `planned`
   - No match, `planned_date < today` → `skipped`

---

## API Surface

### Plan endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/plans/{week_start}` | Get plan for the given week (YYYY-MM-DD, must be a Monday); auto-creates an empty plan if none exists; returns sessions with computed status |
| `POST` | `/plans/{week_start}/sessions` | Add a planned session (with optional segments for cardio) |
| `PUT` | `/plans/{week_start}/sessions/{session_id}` | Update a planned session (title, notes, segments, template) |
| `DELETE` | `/plans/{week_start}/sessions/{session_id}` | Remove a planned session |
| `PATCH` | `/plans/{week_start}/sessions/{session_id}/skip-note` | Set or clear the skip note on a planned session |
| `POST` | `/plans/{week_start}/copy-from-last-week` | Copy all planned sessions from the previous week into this week; no-op if the current week already has sessions |

### AI endpoint extension

| Method | Path | Description |
|---|---|---|
| `POST` | `/ai/adapt-cardio-session` | Takes `planned_session_id` + free-text complaint; sends planned segment structure + 4-week cardio history + athlete context to the LLM; returns modification suggestions as markdown |

---

## AI Prompt Context for Cardio Adapt

The prompt sent to the LLM for `/ai/adapt-cardio-session` follows the same structure as the strength version (Phase 9):

1. **Athlete context block** (experience, goals, injury notes, coach notes) — same as Phase 9; eligible for prompt caching
2. **4-week cardio history** — compacted using `compact_cardio_segments` (existing helper)
3. **Planned session** — formatted as a segment list with target distance/pace per segment
4. **User complaint** — free-text from the modal input

The response is streamed as markdown and rendered in the same modal component used for strength adaptation (or a cardio-specific variant).

---

## Skip Notes as AI Context

Skip notes are surfaced to the AI coach in two ways:

- **Weekly insights** (`POST /ai/weekly-insights`): include skip notes from the current and previous week in the training history block, formatted as `"Skipped [planned session title] on [date]: [note]"`
- **Cardio adapt**: include any skip notes from the past 4 weeks in the prompt context

---

## UI Layout

### `/plan` route

```
[Week navigation: ← May 11–17 | May 18–24 → ]
[Weekly Overview Card: Planned 5 · Done 3 · Skipped 1 · Completion 60%]
[Copy from last week]  (shown only if week has no sessions yet)

Monday May 18
  ┌──────────────────────────────────────────────────────┐
  │ Push Day (Strength)                       ✓ Done     │
  │ [View session ↗]                                     │
  └──────────────────────────────────────────────────────┘
  [+ Add session]

Tuesday May 19
  ┌──────────────────────────────────────────────────────┐
  │ Run – 10 km                               ✗ Skipped  │
  │ Why? [Add note]           [Reschedule] [✎ Swap]      │
  └──────────────────────────────────────────────────────┘
  [+ Add session]

Wednesday May 20
  ┌──────────────────────────────────────────────────────┐
  │ Pull Day (Strength)                       ○ Planned  │
  │ [▶ Start]                 [Reschedule] [✎ Edit]      │
  └──────────────────────────────────────────────────────┘
  [+ Add session]
...
```

**Session card actions by status:**

| Status | Actions |
|---|---|
| Planned (today/future) | **Start** (navigates to pre-filled log form), **Edit** (change content), **Reschedule** (move to different day in same week), **Delete** |
| Done | **View session** (link to logged session detail) |
| Skipped | **Add/edit skip note**, **Reschedule** (shortcut to move to a future day), **Swap** (replace content), **Delete** |

**Reschedule** updates `planned_date` on the existing `PlannedSession` row via `PUT /plans/{week_start}/sessions/{id}`. Constrained to dates within the same week.

**Swap** opens the plan session form modal pre-filled with the current session's content — same as Edit — but with a "Swap" label for skipped sessions to make the intent clearer.

**Start** navigation targets:
- Strength: `/log?type=strength&templateId=<template_id>`
- Cardio: `/log?type=cardio&plannedSessionId=<planned_session_id>`

When `?plannedSessionId=` is present, the cardio log form calls `GET /plans/{week_start}/sessions/{id}` on mount and injects the planned segments as the initial form state. If an existing draft is found in localStorage, the user is asked which to restore (planned session or saved draft) — the existing draft-recovery prompt is extended to offer this choice.

### Cardio adapt in log form

When the user opens the cardio log form for today and the activity type in any segment matches a planned cardio session for today, an "Adapt this session" button appears near the notes field — same pattern as the strength form (Phase 9). The button also appears when the form was opened via `?plannedSessionId=`.
