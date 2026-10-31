# Timed sets
## Validation

### Progress

| Task Group | Status |
|---|---|
| 1. Backend | ✅ Done — migration `f6a7b8c9d0e1` (after `e5f6a7b8c9d0`), models, schemas with the reps-or-duration validator, write/read paths, template history, last-session defaults, plan-vs-actual rows, `compact_sets`, demo seed |
| 2. Frontend form model and lib | ✅ Done — `SetFormValues.duration`, `ExerciseOption.measure`, draft parsing, payloads, `parseDuration` / `findInvalidSetDuration`, `replaceExercise` with measure, formatting, export, the four local mappings |
| 3. Frontend UI | ✅ Done — Settings "Measured in", workout-mode Time stepper, Time column on log page / template editor / session edit, holds on session detail and plan-vs-actual |
| 4. Tests | ✅ Done — backend 437 → 468, frontend 609 → 647 (47 → 48 files) |
| 5. Docs | ✅ Done — roadmap entry and Phase 1 line, README bullet |

---

### Implementation Notes

- **The reps-or-time helpers live in `lib/workoutMode.ts`** (`setKind`, `inputKind`, `setRepsOrDuration`, `parseDuration`) and are re-exported from `lib/strengthSession.ts`, where the plan put them. `SetTabs` needs them, and the test setup imports `SetTabs` (`COMPLETE_SET_TAP_DROPPED`); importing `strengthSession` from there loaded the real `lib/api` before a test could mock it, and the hook tests' last-session fetches failed. `SetTabs` now says so above its imports.
- **A set keeps its input while it is on screen** (`useSetInputKind`). `inputKind(set, measure)` decides which input a set shows, but once a mounted input has held a value it keeps that kind until it remounts. Without this, clearing a duration logged when the exercise was timed (now reps) swapped the field to Reps under the cursor, and the next digits became reps. A new set, another exercise or a structural change remounts and starts over.
- **`replaceExercise` in the hook looks up the measure itself** from its exercise library, so every caller (workout-mode "Choose an exercise", Undo paths) converts kept sets without passing it. The lib function takes `measure` as planned; sets passed in explicitly (the new exercise's last-session defaults) are not converted.
- **The log grid's picker and swap convert too** (`setsForMeasure` before the field changes), which matters on the session edit page, where nothing is prefilled.
- **The template editor also refuses an invalid time.** It has no RPE check, so the plan's "every path that runs `findInvalidSetRpe`" left it out, but a `0` there was saved as an empty template set. Session paths use `findInvalidSet` (RPE first, then time).
- **`stepDuration` snaps to the 5 s grid** (47 → 50 / 45), as the weight increments do, rather than adding 5 to an off-grid value. Floor 0, as planned, so `0` reaches the save check.
- **Only the value a set holds is sent.** Payloads go through `setAmounts`: a set with a time sends `reps: null`, and a hand-edited draft holding both reads and sends as timed.
- **Formatting.** Read-only views use `formatHold` (`45 s`, `1:30`); tabs and lists `45s`, `45s×20`, `1:30`. An all-timed list drops the trailing "reps" and keeps "kg" when weighted (`40s×24, 40s×24 kg`); a mixed list has no trailing unit (`8×60, 45s`). The text export keeps plain seconds (`60 s × 10 kg`), as in the requirements' example. A typed time that is not valid yet shows as typed in the tab, so it is visible before the save refuses it.
- **Headers.** Log grid: `Time (s)` when every set shows Time, `Reps / time` when they mix. Session detail: `Time` / `Reps / time` from the sets' own values.
- **Local mappings (plan §2.6).** `ExerciseEntryBlock`'s two last-session prefills now call the shared `lastSessionToFormSets` instead of carrying a second copy of the mapping; the templates page, session edit (type, `toForm`, PATCH body) and adapt snapshot type carry `duration_seconds`.
- **API details.** `ExercisePatch` refuses `measure: null` (there is no unset measure); omitting it keeps the setting. The migration test asserts the chain has one head (`len(get_heads()) == 1`) and checks this revision's `down_revision`, so the next migration does not need to edit it.
- **Demo seed.** Plank (bodyweight, 3 × 45–75 s) and Farmer's carry (24 kg per hand, noted on the exercise, 3 × 30–45 s) close the Lower body template, under a new "Core" type. Their sets draw from their own RNG key, so every previously seeded value is unchanged.
- **Comparison panel test** is a new `SessionComparisonPanel.test.tsx`; `PlanVsActualCard` does not render the panel.
- **Migration round-trip on Postgres 16** (throwaway `pg-check` container, see `docs/memory/local-dev.md`): `upgrade head` from empty, `downgrade -1` (columns gone), `upgrade head`; an exercise inserted without `measure` reads `reps` throughout.
- **Not verified in a browser.** The local dev backend is not migrated and was left alone, so the Time stepper and the Settings control were checked by tests only, not visually on a phone.
- **Pre-existing:** `ruff check` reports 250 errors at HEAD (not ~230); this change adds none. One existing eslint warning in `StepsForm.tsx`.

---

### Definition of Done

- [x] `POST /sessions/strength` with `duration_seconds: 45` round-trips; `reps` + `duration_seconds`, `0`, `86401` and `45.5` → 422; same rules on template sets
- [x] Template versioning copies `duration_seconds` into history; plan-vs-actual rows carry planned and actual seconds; holds add no volume and stay out of progression, PRs and volume-by-tag
- [x] `exercises.measure` defaults to `reps`, round-trips `time`, PATCH switches it; invalid or null → 422
- [x] Workout mode: Plank shows a Time stepper (±5 s, m:ss kept); the done tab reads `45 s`; choosing Plank for an entry with reps typed leaves an empty Time stepper and posts `reps: null`; Finish with time `0` is refused with "Plank, set 2: time "0" must be 1–86400 seconds (or m:ss)."
- [x] Log page, template editor and session edit show `Time (s)` inputs for timed sets and send `duration_seconds`; an edit of a timed session keeps it
- [x] Drafts written before this change load with `duration: ''` (no draft version bump)
- [x] Text export shows `45 s`, `60 s × 10 kg @RPE 8`; AI context shows `3×45s`, `2×60s@20kg`
- [x] Demo seed produces Plank and Farmer's carry sessions with durations and no reps
- [x] Migration round-tripped on Postgres 16
- [x] `corepack pnpm lint`, `corepack pnpm build`, `corepack pnpm test`, `uv run --frozen pytest -q` green
