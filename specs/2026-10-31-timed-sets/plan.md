# Timed sets
## Implementation Plan

Precedents: `specs/2026-10-07-per-set-rpe/` (a column on every set surface) and the `weight_scale` change (a per-exercise setting that reaches the forms through `ExerciseOption`).

### 1. Backend

1.1 Migration `add_timed_sets` (down `e5f6a7b8c9d0`, the current head `add_weight_scale_to_exercises`; confirm with `uv run alembic heads` before writing it): `exercises.measure VARCHAR(10) NOT NULL server_default 'reps'`; `duration_seconds INTEGER NULL` on `strength_sets`, `strength_template_sets`, `strength_template_history_sets`. Downgrade drops all four. A SQLite migration test like `tests/test_migration_rest_seconds.py` covers upgrade and downgrade (existing rows read `measure = 'reps'`) **and asserts the script directory has exactly one head** (`ScriptDirectory.from_config(...).get_heads()`), so a wrong `down_revision` fails in CI instead of at deploy.

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

2.2 `lib/strengthSession.ts`: `parseSet` reads `duration` with `''` fallback (no draft version bump); `buildStrengthPayload`, `toTemplatePayload`, `buildAdaptSnapshot` send `duration_seconds: int | null`; `templateToFormValues`, `lastSessionToFormSets`, `LastSessionDefaults`, `TemplateSet` carry it; `addSet` copies the last set's `duration`; `computeDiff` reports "Changed time on X set N".
- `parseDuration(value)`: `"90"` or `"1:30"` → 90 (same grammar as `parseRestInput`); null for blank, `0`, > 86400 or anything else. `isValidSetDuration` = blank or parses.
- `findInvalidSetDuration(exercises, nameOf)` mirrors `findInvalidSetRpe` and is wired into every save path that calls the RPE check (log page submit, workout-mode finish, session detail edit), so a `0` or `1:3` never silently becomes an empty set.
- `updateSet` callers that edit `reps` pass `{ reps, duration: '' }` and those that edit `duration` pass `{ duration, reps: '' }` (a `setRepsOrDuration` helper keeps this in one place).
- `replaceExercise(exercises, exIndex, exerciseId, sets?, measure?)`: when the new exercise's measure differs from the kind the sets hold, clears the mismatched field on every set (weight, notes, rpe, done kept).
- `setKind(set): 'reps' | 'time' | null` from the set's own values; `inputKind(set, measure)` = `setKind(set) ?? measure` decides which input to show.

2.3 `lib/workoutMode.ts`: `isBlankEntry` includes `duration`; `newExerciseSets` copies `duration_seconds`; `formatSet`, `formatSetShort`, `formatSetList`, `setTabLabel`, `exerciseSummary` render timed sets (`45 s`, `1:30`, `45s×20`), with the unit per item in mixed lists; `formatHold(seconds)` = `45 s` below 60, `formatClock` otherwise; `stepDuration` moves by 5 s with a floor of 0.

2.4 `lib/exportUtils.ts`: set line uses `45 s` in place of the reps figure when `duration_seconds` is set.

2.5 `lib/planApi.ts`: `SetComparisonRow` type gains the two duration fields.

2.6 Local mappings that bypass `lib/strengthSession.ts` and must carry `duration` too (they silently drop it otherwise):
- `components/ExerciseEntryBlock.tsx` maps last-session defaults to form sets in two places (around the prefill on exercise pick and on "use last session"); both get `duration`.
- `pages/TemplatesPage.tsx` has its own set ⇄ form mapping (`reps`/`weight_kg` both ways); add `duration_seconds` ⇄ `duration`.
- `pages/StrengthSessionDetailPage.tsx` has a local `StrengthSet` type, a `toForm` mapper and its own PATCH body; all three get `duration_seconds`. Without it an edit of a timed session posts `reps: null` and the backend, which rebuilds sets from the payload, deletes the duration.
- `components/AdaptSessionModal.tsx` `SessionSnapshot.sets` type gains `duration_seconds: number | null`.

### 3. Frontend — UI

3.1 Settings › Exercises (`pages/SettingsPage.tsx`): `ExerciseFormValues.measure: 'reps' | 'time'`; a two-option segmented control labelled "Measured in" under the weight-steps control; create and patch mutations send `measure`; the row list shows a small "time" tag on timed exercises.

3.2 Workout mode (`components/workout/SetTabs.tsx`, `pages/WorkoutModePage.tsx`): `SetEditor` takes `measure`; when `inputKind(set, measure) === 'time'` the first `Stepper` is `label="Time" unit="s" step={stepDuration} stepLabel="by 5 s" inputMode="numeric"` bound to `set.duration`, focus handling unchanged (`repsRef` points at it). Editing it writes `{ duration, reps: '' }`; the Reps stepper writes `{ reps, duration: '' }`. The measure comes from the entry's `ExerciseOption`. "Choose exercise" (`handlePickExercise` → `replaceExercise`) passes the new exercise's measure so mismatched values are cleared.

3.3 Log page and template editor (`components/ExerciseEntryBlock.tsx`): per set, header "Reps" becomes "Time" and the input binds to `duration` (`inputMode="numeric"`, accepts digits and `m:ss`) when `inputKind(set, measure) === 'time'`; the header is per exercise block (all sets of a timed exercise show Time unless one holds reps). Typing in one field clears the other. Picking a different exercise goes through `replaceExercise` with the measure. `showRpe`/`showDone` layout unchanged.

3.4 `pages/StrengthSessionDetailPage.tsx`: table cell shows `formatHold` for a timed set; the edit form maps `duration_seconds` ⇄ `duration` like reps.

3.5 `components/plan/SessionComparisonPanel.tsx`: a row with a duration shows it in the reps cell as `45 s`; the four `planned_reps != null || planned_weight_kg != null` set-count filters (per exercise and totals) also count a present duration, or a bodyweight Plank reads "0 sets".

### 4. Tests

- Backend `tests/test_exercises.py`: `measure` defaults to `reps`, round-trips `time`, patch switches it, an invalid value is 422; last-session defaults return `duration_seconds`.
- Backend `tests/test_sessions.py`: a set with `duration_seconds=45` round-trips; `reps` + `duration_seconds` → 422; `0` and `86401` → 422; the history-list `total_volume` ignores a **weighted** timed set (`weight=20, duration_seconds=60`), and PATCH of a timed session keeps the duration.
- Backend `tests/test_templates.py`: template set duration round-trips and appears in history after a version bump.
- Backend `tests/test_ai.py`: `compact_sets` renders `3×45s`, `2×60s@20kg`, keeps timed and reps sets apart.
- Backend `tests/test_plan_comparison.py`: planned/actual duration in set rows; volume unchanged.
- Backend `tests/test_migration_timed_sets.py`: upgrade adds the four columns with `measure='reps'` on existing rows; downgrade removes them; the script directory has one head.
- Backend analytics: one test that a weighted timed set does not appear in progression/PRs/volume-by-tag.
- Frontend `strengthSession.test.ts`: draft without `duration` parses to `''`; payloads send int or null; `addSet` copies it; diff message; `parseDuration` (`"90"`, `"1:30"`, `"0"`, `"1:3"`, `"90000"`); `findInvalidSetDuration`; `replaceExercise` with a different measure clears reps but keeps weight/notes/rpe/done; editing reps clears duration and vice versa.
- Frontend `workoutMode.test.tsx`: `formatSet`/`formatSetShort`/`formatSetList` for timed and mixed sets; `isBlankEntry`; `stepDuration`.
- Frontend `WorkoutModePage.test.tsx`: a timed exercise shows the Time stepper; ± moves by 5; completing the set shows `45 s` on the done row; entering reps for Bench then choosing Plank for that entry shows an empty Time stepper and the saved payload has `reps: null`; finishing with time `0` is refused with the message.
- Frontend `TemplatesPage.test.tsx`: a timed template set round-trips through the local mapping (PATCH body has `duration_seconds`).
- Frontend `StrengthSessionEdit.test.tsx`: editing a timed session keeps `duration_seconds` in the PATCH body.
- Frontend `PlanVsActualCard` / comparison panel test: a bodyweight timed row counts as one planned and one actual set.
- Frontend `ExerciseEntryBlockSets.test.tsx`: header and input swap for a timed exercise.
- Frontend `SettingsPage.test.tsx`: the "Measured in" control saves `measure`.
- Frontend `exportUtils.test.ts`: timed set line.

### 5. Docs

- `specs/roadmap.md`: a "Timed sets" entry pointing to this spec, and the Phase 1 "Strength logging — sets × reps × weight" line gets "(or seconds for timed exercises)".
- `README.md`: the strength bullet list mentions time-based sets.
- `specs/2026-10-07-per-set-rpe/requirements.md` needs no change; its "template sets have no RPE" note still holds.
