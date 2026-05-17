# Phase 14 — Plan vs. Actual Deep Analytics: Requirements

## Goal

Make the gap (or match) between planned and completed training visible at the session level. A user can expand any "Done" card on the Plan tab and see exactly what they planned vs. what they actually did — totals for cardio, exercise-by-exercise for strength.

---

## Context: What Phase 12 Already Shipped

Phase 12 delivered two of the three Phase 14 roadmap items:

| Item | Status | Where |
|---|---|---|
| Plan tab weekly totals (planned vs. actual distance/volume) | ✅ Done | `PlanVsActualCard` + `GET /plan/weekly-summary` |
| Analytics: Plan Adherence rolling chart | ✅ Done | `PlanAdherenceChart` + `GET /analytics/plan-adherence` |

Phase 14 delivers the remaining item: **per-session comparison** on Done plan cards.

---

## Scope

### 1. Template Versioning

Currently, a planned strength session stores only `template_id`. If the template is edited after planning, the "planned" side of any comparison would reflect today's template, not what the user planned at the time.

The fix: add version tracking to templates. Every time a template is saved, its version is incremented and the full exercise/set state is written to history tables. A planned session records the template's version at the moment of planning.

This also unblocks future "how has my squat template evolved?" browsing — Phase 2 backlog item.

**How versioning works:**

- `strength_templates` gains a `current_version` integer (starts at 1 for all new and migrated templates).
- Three new read-only history tables:
  - `strength_template_history` — one row per version: `(id, template_id, version, created_at)`.
  - `strength_template_history_exercises` — exercises at that version: `(id, history_id, exercise_id, exercise_order)`.
  - `strength_template_history_sets` — sets per exercise: `(id, history_exercise_id, set_order, reps, weight_kg)`.
- `planned_sessions` gains `template_version` (nullable integer). Populated at plan-creation time.
- History rows are never edited — only created.

**When history is written:**

| Event | Action |
|---|---|
| `POST /templates` (new template) | Write version 1 history snapshot from the submitted exercises |
| `PUT /templates/{id}` (edit template) | Increment `current_version`, write new history snapshot from updated exercises |
| `POST /plan/.../sessions` (strength) | Set `planned_sessions.template_version = template.current_version` |
| `PUT /plan/.../sessions/{id}` (strength, same template) | `template_version` unchanged |
| `PUT /plan/.../sessions/{id}` (strength, template changed) | Set `template_version = new_template.current_version` |
| `copy_from_last_week` (strength) | Set `template_version = current_template.current_version` at copy time |

**Data migration:** All existing templates get `current_version = 1` and a version 1 history snapshot written from their current exercises. Existing `planned_sessions` get `template_version = NULL` — these sessions have no version data and comparison shows a "no history available" message instead of planned exercises.

**Template deletion:** `strength_template_history` cascades on template delete. `planned_sessions.template_id` becomes NULL (existing behaviour). The comparison endpoint detects `template_id = NULL` or `template_version = NULL` and returns 404 with an appropriate detail message.

---

### 2. Per-Session Comparison on Done Plan Cards

On a "Done" planned session card (Plan tab), a `▸ Compare planned vs. actual` toggle expands an inline comparison panel. The panel is lazy-loaded on first open and cached by React Query.

**Cardio comparison:**
- Two-row table: Distance (km) and Duration (min).
- Planned values are summed from the planned cardio segments.
- Actual values come from the matched logged session.

**Strength comparison:**
- Per-exercise table. Exercises are matched between the history snapshot and the logged session by `exercise_id`.
- For each exercise: set-by-set comparison (planned reps × weight vs. actual reps × weight), paired by set index; if set counts differ, the shorter side is padded with em-dashes.
- Exercises appear in history snapshot order; exercises present only in the actual session are appended at the end.
- Per-exercise volume (kg·reps) summary row beneath each exercise's sets.
- Grand total volume row below all exercises.

**Display:** Expandable inline section — `▸ Compare planned vs. actual` toggle below "View session →" on Done cards only. Planned and Skipped cards have no toggle.

---

## New Backend Endpoint

`GET /plan/sessions/{planned_session_id}/comparison`

- Auth-protected; 403 if session belongs to another user.
- 404 if `matched_session_id` is null, `template_id` is null (deleted), or `template_version` is null (pre-Phase-14 session). Detail message distinguishes these cases.
- **Cardio response:** `planned_distance_km`, `actual_distance_km`, `planned_duration_min`, `actual_duration_min`.
- **Strength response:** `exercises` list (per-exercise sets + volume); `planned_total_volume`, `actual_total_volume`.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Versioning vs. per-session snapshot | Versioning | No duplication; unlocks template history feature later |
| History writes | On every template save (create + edit) | Simple rule; single-user so version count is not a concern |
| `template_version` on plan create | Snapshot current version | Records exactly what was planned |
| `template_version` on copy-from-last-week | Use current version at copy time | The copied plan is a new plan; it plans against today's template |
| `template_version` on plan edit (same template) | Unchanged | Don't silently update what was planned when user only reschedules |
| Pre-Phase-14 sessions | 404 with message | Retroactive comparison not possible; fail gracefully |
| Display pattern | Expandable toggle on Done cards | Avoids cluttering every card; user opts in |
| Data fetch timing | Lazy on first toggle open | Avoids N API calls on initial plan render |
| Set pairing | By set index | Simple and predictable; no fuzzy matching needed |
| Exercises not in snapshot | Appended as "actual_only" | Surfaced, not silently dropped |
| Cardio granularity | Total distance + duration only | Segment-level comparison adds complexity with low payoff |

---

## Out of Scope for Phase 14

- UI for browsing template history (building the data; UI comes later)
- HR data in the comparison
- Segment-level comparison for cardio
- Edit actions from the comparison panel
- Comparison export
- Retroactive snapshots for planned sessions created before Phase 14
