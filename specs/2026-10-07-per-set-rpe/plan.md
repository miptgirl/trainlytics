# Per-set RPE
## Implementation Plan

### 1. Backend

1.1 Migration `add_rpe_to_strength_sets` (down `a1b2c3d4e5f6`): `op.add_column('strength_sets', sa.Column('rpe', sa.Integer(), nullable=True))`.

1.2 `StrengthSet.rpe: Mapped[int | None]` in `app/models/session.py`.

1.3 `StrengthSetCreate.rpe: int | None = Field(default=None, ge=1, le=10)` and `StrengthSetOut.rpe: int | None = None` in `app/schemas/session.py`. The explicit `StrengthSetOut(...)` construction in `app/api/sessions.py` passes `rpe=s.rpe`.

1.4 `compact_sets` in `app/services/ai_service.py`: `rpe` joins the equality key; a group with RPE renders as `3×5@100kg RPE8`. Elements without an `rpe` attribute or key (template sets, plan snapshots) behave as before.

1.5 Demo seed: drop the `RPE: N` strings from `SET_NOTES`; give roughly a third of working sets an `rpe` in 6–9, deterministic from the existing per-item RNG.

### 2. Frontend — form model and lib

2.1 `SetFormValues.rpe: string` in `ExerciseEntryBlock.tsx`; `emptySet()` in `exerciseEntryDefaults.ts` sets `''`.

2.2 `lib/strengthSession.ts`: `parseSet` reads `rpe` with `''` fallback (no draft version bump); payload builders send `rpe: parseInt or null`; session-to-form mappers (`StrengthSessionDetailPage`, `useStrengthSessionForm`, last-session defaults) carry it. `lastSessionToFormSets` and `newExerciseSets` leave it empty.

2.3 `lib/workoutMode.ts`: `formatSet` appends ` @N` when `rpe` is set; `isBlankEntry` treats a set with only `rpe` as not blank.

2.4 `lib/exportUtils.ts`: set line gets ` @RPE N` when present.

### 3. Frontend — UI

3.1 `components/workout/WorkoutSetList.tsx`: `RpeChips` row in `SetEditor` under Weight. Chips `5–10`, ≥44px tall, `aria-pressed`, `aria-label="RPE N for set M"`; tapping the selected chip clears. Done-set rows show the value via `formatSet`.

3.2 `components/ExerciseEntryBlock.tsx`: "RPE" column in the set grid, `inputMode="numeric"`, digits only, max 10, hidden on narrow screens (`max-sm:hidden`) like Notes. Adjust `gridCols`.

3.3 `pages/StrengthSessionDetailPage.tsx`: RPE column in the table (`—` when null) and in the edit form.

### 4. Tests

- Backend `tests/test_sessions.py`: create with `rpe=8` round-trips; `rpe=0`, `11` and `7.5` are rejected with 422; patch keeps or changes it.
- Backend `tests/test_ai.py` (or wherever `compact_sets` is covered): sets differing only in RPE are not merged; template sets without `rpe` still compact.
- Frontend `workoutMode.test.tsx`: `formatSet` with and without RPE; `isBlankEntry`.
- Frontend `strengthSession.test.ts`: draft without `rpe` parses to `''`; payload sends integer or null.
- Frontend `WorkoutModePage.test.tsx` or `WorkoutSetList`: tap chip 8 → done row shows `@8`; tap again clears.
- Frontend `exportUtils.test.ts`: set line with RPE.

### 5. Docs

`specs/roadmap.md`: entry pointing to this spec. `specs/tech-stack.md` only if it lists set fields.
