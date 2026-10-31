# Timed sets
## Implementation Plan

Precedents: `specs/2026-10-07-per-set-rpe/` (a column on every set surface) and the `weight_scale` change (a per-exercise setting that reaches the forms through `ExerciseOption`).

### 1. Backend

1.1 Migration `add_timed_sets` (down `c7d8e9f0a1b2`): `exercises.measure VARCHAR(10) NOT NULL server_default 'reps'`; `duration_seconds INTEGER NULL` on `strength_sets`, `strength_template_sets`, `strength_template_history_sets`. Downgrade drops all four. A SQLite migration test like `tests/test_migration_rest_seconds.py` covers upgrade and downgrade (existing rows read `measure = 'reps'`).

1.2 Models: `Exercise.measure: Mapped[str]` (default `"reps"`), `StrengthSet.duration_seconds`, `StrengthTemplateSet.duration_seconds`, `StrengthTemplateHistorySet.duration_seconds`.

1.3 Schemas:
- `app/schemas/exercise.py`: `Measure = Literal["reps", "time"]`; `ExerciseCreate.measure: Measure = "reps"`, `ExercisePatch.measure: Measure | None = None`, `ExerciseOut.measure: Measure`; `SetDefault.duration_seconds: int | None = None`.
- `app/schemas/session.py`: `StrengthSetCreate.duration_seconds: int | None = Field(default=None, ge=1, le=86400)` plus a `model_validator` refusing `reps` and `duration_seconds` together; `StrengthSetOut.duration_seconds: int | None = None`.
- `app/schemas/template.py`: same two fields and the same validator on `StrengthTemplateSetCreate` / `Out`.
- `app/schemas/plan.py`: `SetComparisonRow.planned_duration_seconds` / `actual_duration_seconds` (`int | None`, default None).

1.4 Write paths: `api/exercises.py` create and patch apply `measure`; `api/sessions.py` and `api/templates.py` build sets from the schema and need `duration_seconds` wherever `reps` is passed explicitly (`_build_strength_out`, the create/patch loops); `services/template_versioning.py` copies it into `StrengthTemplateHistorySet`; `api/exercises.py` last-session defaults return it; `api/plan_summary.py` fills the new comparison fields in both loops.

1.5 `compact_sets` in `services/ai_service.py`: `duration_seconds` joins the key; a timed group renders `N×45s` (`45s` for one), `@20kg` only when weight is set; `_weight` handling for reps groups is unchanged. The adapt-session snapshot reads `duration_seconds` from the client dict the way it reads `rpe`.

1.6 Demo seed: add `Plank` (time, bodyweight, 3 × 45–75 s) and `Farmer's carry` (time, 2 × 24 kg, 3 × 30–45 s) to the exercise catalogue and one template; sessions generate `duration_seconds` and `reps = None` for them.

### 2. Frontend — form model and lib

2.1 `SetFormValues.duration: string` (whole seconds as typed; `''` when unset) in `ExerciseEntryBlock.tsx`; `emptySet()` sets `''`. `ExerciseOption.measure?: 'reps' | 'time'`; `WeightScale`-style type `Measure` in `lib/workoutMode.ts`.

2.2 `lib/strengthSession.ts`: `parseSet` reads `duration` with `''` fallback (no draft version bump); `buildStrengthPayload`, `toTemplatePayload`, `buildAdaptSnapshot` send `duration_seconds: int | null`; `templateToFormValues`, `lastSessionToFormSets`, `LastSessionDefaults`, `TemplateSet` carry it; `addSet` copies the last set's `duration`; `computeDiff` reports "Changed time on X set N"; a `parseDuration` helper mirrors `parseSetRpe` (digits only, ≥ 1, else null) and a `findInvalidSetDuration`-style check is not needed because the input is digits-only and the payload sends null for blank.

2.3 `lib/workoutMode.ts`: `isBlankEntry` includes `duration`; `newExerciseSets` copies `duration_seconds`; `formatSet`, `formatSetShort`, `formatSetList`, `setTabLabel`, `exerciseSummary` render timed sets (`45 s`, `1:30`, `45s×20`), with the unit per item in mixed lists; `formatHold(seconds)` = `45 s` below 60, `formatClock` otherwise; `stepDuration` moves by 5 s with a floor of 0.

2.4 `lib/exportUtils.ts`: set line uses `45 s` in place of the reps figure when `duration_seconds` is set.

2.5 `lib/planApi.ts`: `SetComparisonRow` type gains the two duration fields.

### 3. Frontend — UI

3.1 Settings › Exercises (`pages/SettingsPage.tsx`): `ExerciseFormValues.measure: 'reps' | 'time'`; a two-option segmented control labelled "Measured in" under the weight-steps control; create and patch mutations send `measure`; the row list shows a small "time" tag on timed exercises.

3.2 Workout mode (`components/workout/SetTabs.tsx`, `pages/WorkoutModePage.tsx`): `SetEditor` takes `measure`; for `time` the first `Stepper` is `label="Time" unit="s" step={stepDuration} stepLabel="by 5 s" inputMode="numeric"` bound to `set.duration`, focus handling unchanged (`repsRef` points at it). The measure comes from the entry's `ExerciseOption`, except that an existing set with `duration` set and `reps` empty always shows the Time stepper (and vice versa), so sets logged under an earlier measure stay editable.

3.3 Log page and template editor (`components/ExerciseEntryBlock.tsx`): header "Reps" becomes "Time (s)" and the input binds to `duration` with `inputMode="numeric"`, digits only, when the selected exercise's measure is `time` (same per-set exception as 3.2). `showRpe`/`showDone` layout unchanged.

3.4 `pages/StrengthSessionDetailPage.tsx`: table cell shows `formatHold` for a timed set; the edit form maps `duration_seconds` ⇄ `duration` like reps.

3.5 `components/plan/SessionComparisonPanel.tsx`: a row with a duration shows it in the reps cell as `45 s`.

### 4. Tests

- Backend `tests/test_exercises.py`: `measure` defaults to `reps`, round-trips `time`, patch switches it, an invalid value is 422; last-session defaults return `duration_seconds`.
- Backend `tests/test_sessions.py`: a set with `duration_seconds=45` round-trips; `reps` + `duration_seconds` → 422; `0` and `86401` → 422; the history-list `total_volume` ignores timed sets.
- Backend `tests/test_templates.py`: template set duration round-trips and appears in history after a version bump.
- Backend `tests/test_ai.py`: `compact_sets` renders `3×45s`, `2×60s@20kg`, keeps timed and reps sets apart.
- Backend `tests/test_plan_comparison.py`: planned/actual duration in set rows; volume unchanged.
- Backend `tests/test_migration_timed_sets.py`: upgrade adds the four columns with `measure='reps'` on existing rows; downgrade removes them.
- Backend analytics: one test that a timed set does not appear in progression/PRs.
- Frontend `strengthSession.test.ts`: draft without `duration` parses to `''`; payloads send int or null; `addSet` copies it; diff message.
- Frontend `workoutMode.test.tsx`: `formatSet`/`formatSetShort`/`formatSetList` for timed and mixed sets; `isBlankEntry`; `stepDuration`.
- Frontend `WorkoutModePage.test.tsx`: a timed exercise shows the Time stepper; ± moves by 5; completing the set shows `45 s` on the done row.
- Frontend `ExerciseEntryBlockSets.test.tsx`: header and input swap for a timed exercise.
- Frontend `SettingsPage.test.tsx`: the "Measured in" control saves `measure`.
- Frontend `exportUtils.test.ts`: timed set line.

### 5. Docs

- `specs/roadmap.md`: a "Timed sets" entry pointing to this spec, and the Phase 1 "Strength logging — sets × reps × weight" line gets "(or seconds for timed exercises)".
- `README.md`: the strength bullet list mentions time-based sets.
- `specs/2026-10-07-per-set-rpe/requirements.md` needs no change; its "template sets have no RPE" note still holds.
