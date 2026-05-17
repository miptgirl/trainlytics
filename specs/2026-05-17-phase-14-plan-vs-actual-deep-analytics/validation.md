# Phase 14 — Validation

## Progress

| Area | Status |
|---|---|
| DB migration (new tables + columns + data migration) | ✅ Done |
| SQLAlchemy models for history tables | ✅ Done |
| Template create: write version 1 history snapshot | ✅ Done |
| Template edit: increment version + write history snapshot | ✅ Done |
| Plan create (strength): store `template_version` | ✅ Done |
| Plan edit: update `template_version` when template changes | ✅ Done |
| Copy-from-last-week: carry current version | ✅ Done |
| Comparison endpoint + schemas | ✅ Done |
| `useSessionComparison` hook + TypeScript types | ✅ Done |
| `SessionComparisonPanel` component | ✅ Done |
| `PlannedSessionCard` toggle + panel integration | ✅ Done |
| Tests | ✅ Done |

---

## Definition of Done

A user can:
1. Create a strength template. Edit it. The version increments; the original exercises are preserved in history.
2. Plan a strength session from that template. The plan records the template version at that moment.
3. Edit the template again (version increments again). The planned session still points to the old version.
4. Log the session. Open the Done card on the Plan tab. Tap "▸ Compare planned vs. actual" — see a per-exercise breakdown showing the exercises and sets that were planned *when the session was planned*, vs. what was actually logged.
5. Do the same for a Done cardio session — see a two-row table with Distance and Duration planned vs. actual.
6. Exercises added during logging are labeled "(added)". Template exercises skipped during logging are labeled "(not logged)".

---

## Success Criteria

### Template Versioning

| Check | Expected |
|---|---|
| New template created | `current_version = 1`; one `strength_template_history` row with `version = 1` |
| Template edited | `current_version = 2`; new history row with `version = 2`; version 1 row unchanged |
| History exercises for version 1 | Match original template exercises (unaffected by version 2 edit) |
| Plan created (strength) | `planned_sessions.template_version = template.current_version` at creation time |
| Plan edited — same template, date change | `template_version` unchanged |
| Plan edited — template swapped | `template_version = new_template.current_version` |
| Copy from last week (strength) | Copied session has `template_version = current template version` at copy time |
| Template deleted | `strength_template_history` rows cascade-deleted; `planned_sessions.template_id` set to NULL |

### Comparison API

| Check | Expected |
|---|---|
| Cardio done session | 200; `session_type = "cardio"`; `cardio` populated; `strength = null` |
| Strength done session (with version) | 200; `session_type = "strength"`; `strength.exercises` non-empty; `cardio = null` |
| Session not done | 404 |
| `template_id = null` (template deleted) | 404 with descriptive message |
| `template_version = null` (pre-Phase-14 session) | 404 with descriptive message |
| Wrong user | 403 |
| Planned exercise not in logged session | `source = "planned_only"`; all actual set fields `null` |
| Logged exercise not in history snapshot | `source = "actual_only"`; all planned set fields `null` |
| Set count mismatch | Shorter side padded with `null`; longer side fully populated |
| Cardio null planned segments | `planned_distance_km = null`, `planned_duration_min = null` |
| Deleted exercise in history | `exercise_name = "Unknown exercise"` (exercise_id is null); comparison still renders |

### Plan Tab — Done Card UI

| Scenario | Expected |
|---|---|
| Done cardio card, toggle closed | "View session →" only; no comparison data |
| Done cardio card, toggle open | Two-row table (Distance, Duration) with Planned / Actual columns |
| Done strength card, toggle open | Per-exercise section with set table; volume row; total volume below all exercises |
| Planned card | No compare toggle present |
| Skipped card | No compare toggle present |
| Re-open after close | No re-fetch (React Query cache) |
| Pre-Phase-14 done card, toggle open | "Planned data not available." in muted italic |

---

## Manual Validation — Local Deployment

**Prerequisites:** app running via `docker compose up --build`, migrations applied (`alembic upgrade head`).

### 1. Migration

1. Confirm migration applies cleanly.
2. Check DB: `strength_templates` has `current_version` column; `planned_sessions` has `template_version` column.
3. Check DB: `strength_template_history`, `strength_template_history_exercises`, `strength_template_history_sets` tables exist.
4. Confirm all existing templates have a version 1 history row in `strength_template_history`.

### 2. Template versioning

1. Open Settings → Templates. Edit any template — change a set weight and Save.
2. Check DB: `current_version = 2`; a new `strength_template_history` row exists for version 2 with the updated weight.
3. Confirm version 1 history row still exists with the old weight.

### 3. Plan creation stores template version

1. Open the Plan tab. Add a strength session using the template from step 2.
2. Check DB: `planned_sessions.template_version = 2` (current version at plan time).
3. Edit the template again. Check DB: existing planned session still has `template_version = 2`.

### 4. Copy from last week

1. On the current week with a strength planned session, navigate to the next week and trigger "Copy from last week".
2. Check DB: the copied planned session has `template_version = current_version` of the template (not the old version).

### 5. Cardio comparison

1. Ensure at least one Done cardio session exists in the Plan tab.
2. On the Done card, confirm "▸ Compare planned vs. actual" toggle is present.
3. Click the toggle — confirm a table appears with Distance (km) and Duration (min) rows showing Planned and Actual columns.
4. Verify planned values match the plan card summary; actual values match the linked session.
5. Click the toggle again — panel collapses.
6. Re-open — no loading flicker (cached).

### 6. Strength comparison

1. Ensure at least one Done strength session exists with a matching planned session.
2. Expand "▸ Compare planned vs. actual" on the Done card.
3. Confirm exercises from the template (at plan-time version) are shown with a set-by-set table.
4. Verify planned reps × weight match the template version that was current at plan time (not the current version if it has since been updated).
5. Verify actual reps × weight match the logged session.
6. If sets differ in count: confirm shorter side shows "—".
7. Confirm per-exercise volume rows and total volume row are visible.

### 7. Edge cases

1. Log a session adding an exercise not in the template. Open comparison. Confirm it appears with "(added)" label and planned columns showing "—".
2. Skip a template exercise in the log. Open comparison. Confirm it appears with "(not logged)" label and actual columns showing "—".
3. Open a Planned card — confirm no compare toggle.
4. Open a Skipped card — confirm no compare toggle.

---

## Testing

### Template versioning (`backend/tests/test_templates.py`)

- `test_create_template_writes_version_1_history` — POST template with 2 exercises; assert `current_version = 1`; `strength_template_history` has one row; exercises match.
- `test_update_template_increments_version` — PUT with changed weight; assert `current_version = 2`; new history row; old history row unchanged.
- `test_update_template_version_1_history_unchanged` — version 1 sets still reflect the original weight after PUT.

### Plan versioning (`backend/tests/test_plans.py`)

- `test_plan_session_stores_template_version` — create strength planned session; assert `template_version = template.current_version`.
- `test_plan_session_edit_same_template_version_unchanged` — edit planned session (date only); assert `template_version` unchanged.
- `test_plan_session_edit_new_template_updates_version` — swap template; assert `template_version = new_template.current_version`.
- `test_copy_from_last_week_uses_current_version` — update template (version → 2); copy plan; assert copied session has `template_version = 2`.

### Comparison endpoint (`backend/tests/test_plan_comparison.py`)

- `test_comparison_cardio_basic` — planned + matched logged cardio; assert distance/duration values.
- `test_comparison_strength_basic` — 2-exercise template + matching logged session; assert exercise list and volumes.
- `test_comparison_strength_extra_exercise_in_actual` — extra logged exercise; assert `source = "actual_only"`.
- `test_comparison_strength_exercise_only_in_template` — skipped template exercise; assert `source = "planned_only"`, actual fields null.
- `test_comparison_strength_set_count_mismatch` — 3 planned sets vs 4 logged; assert 4 rows; 4th planned row null.
- `test_comparison_not_done_returns_404` — planned session; assert 404.
- `test_comparison_no_template_version_returns_404` — `template_version = NULL`; assert 404.
- `test_comparison_wrong_user_returns_403` — other user; assert 403.

### Regression

- `pytest` (backend) — all existing template, plan, plan_summary, and analytics tests pass.
- `vitest` (frontend) — no failures.
- Plan tab: Planned and Skipped card flows unchanged.
- `PlanVsActualCard` (weekly summary) unchanged.
- `PlanAdherenceChart` unchanged.
