# Timed sets
## Validation

### Progress

| Task Group | Status |
|---|---|
| 1. Backend | ✅ Done — migration `f6a7b8c9d0e1` (after `e5f6a7b8c9d0`), models, schemas with the reps-or-duration validator, write/read paths, template history, last-session defaults, plan-vs-actual rows, `compact_sets`, demo seed |
| 2. Frontend form model and lib | ✅ Done — `SetFormValues.duration`, `ExerciseOption.measure`, draft parsing, payloads, `parseDuration` / `findInvalidSetDuration`, `replaceExercise` with measure, formatting, export, the four local mappings |
| 3. Frontend UI | ✅ Done — Settings "Measured in", workout-mode Time stepper, Time column on log page / template editor / session edit, holds on session detail and plan-vs-actual |
| 4. Tests | ✅ Done — backend 437 → 468 → 470, frontend 609 → 647 → 653 → 658 (47 → 48 files); later figures after review rounds 1 and 2 |
| 5. Docs | ✅ Done — roadmap entry and Phase 1 line, README bullet |

---

### Implementation Notes

- **The reps-or-time helpers live in `lib/workoutMode.ts`** (`setKind`, `inputKind`, `setRepsOrDuration`, `parseDuration`) and are re-exported from `lib/strengthSession.ts`, where the plan put them. `SetTabs` needs them, and the test setup imports `SetTabs` (`COMPLETE_SET_TAP_DROPPED`); importing `strengthSession` from there loaded the real `lib/api` before a test could mock it, and the hook tests' last-session fetches failed. `SetTabs` now says so above its imports.
- **Which input a set shows is `inputKind(set, measure)` and nothing else** (review round: the first version remembered a kind per mounted input, which could outlive an exercise switch). Clearing a legacy value flips the set to the exercise's kind. The log grid and the workout stepper keep one input element whose binding switches (both `useController`s run unconditionally; the grid switches `type` between `number` and `text`), so the clearing keystroke keeps focus.
- **Prefill follows the exercise's current measure.** `last-session-defaults` drops reps for a timed exercise and durations for a reps one (weight kept); template exercises carry `measure` and `templateToFormValues` converts with `setsForMeasure`. Template sets stay as entered, and `computeDiff` compares against the template converted the same way: an untouched stale template (reps 40 on a now-timed exercise) is no change and keeps its reps until the user enters a time, which then reads "Changed time on … set 1" and is what "Update template" writes. A weight change on such a set still updates the template to the session's values, reps included (none). Settings invalidates the cached defaults (`staleTime: Infinity`) on every exercise save, and workout mode also converts defaults with the exercise's measure when it builds sets, so a stale cache cannot prefill the old kind.
- **`replaceExercise` in the hook looks up the measure itself** from its exercise library, so every caller (workout-mode "Choose an exercise", Undo paths) converts kept sets without passing it. The lib function takes `measure` as planned; sets passed in explicitly (the new exercise's last-session defaults) are not converted.
- **The log grid's picker and swap convert too** (`setsForMeasure` before the field changes), which matters on the session edit page, where nothing is prefilled.
- **The template editor also refuses an invalid time.** It has no RPE check, so the plan's "every path that runs `findInvalidSetRpe`" left it out, but a `0` there was saved as an empty template set. Session paths use `findInvalidSet` (RPE first, then time).
- **`stepDuration` snaps to the 5 s grid** (47 → 50 / 45), as the weight increments do, rather than adding 5 to an off-grid value. Stepping down to 0 gives blank (an empty set), never `0`, so a stray − does not block Finish (review round; the plan had a floor of 0).
- **The Time input ignores** a keystroke or paste with anything but digits and `:` (the previous value stays), after trimming spaces and a trailing `s` / ` s`, so `45 s` or `1:30 ` pasted from a read-only view is taken. Typed one key at a time on a desktop keyboard, `45.5` therefore ends as `455`: the `.` is dropped visibly and the `5` is a valid keystroke. Phones have no `.` on the numeric keypad.
- **Only the value a set holds is sent.** Payloads go through `setAmounts`: a set with a time sends `reps: null`, and a hand-edited draft holding both reads and sends as timed.
- **Formatting.** Read-only views use `formatHold` (`45 s`, `1:30`); tabs and lists `45s`, `45s×20`, `1:30`. An all-timed list drops the trailing "reps" and keeps "kg" when weighted (`40s×24, 40s×24 kg`); a mixed list has no trailing unit, each item carries its own (`8×60, 45s`, or `8 reps, 45s` without weights). A list where no set holds reps or a time is null: defaults the server blanked (last session logged the other kind) show no "Last time" and the chooser falls back to "3 sets"; done sets without an amount read "2 sets done". The text export keeps plain seconds (`60 s × 10 kg`), as in the requirements' example. A typed time that is not valid yet shows as typed in the tab, so it is visible before the save refuses it.
- **Headers.** Log grid: `Time (s)` when every set shows Time, `Reps / time` when they mix. Session detail: `Time` / `Reps / time` from the sets' own values.
- **Local mappings (plan §2.6).** `ExerciseEntryBlock`'s two last-session prefills now call the shared `lastSessionToFormSets` instead of carrying a second copy of the mapping; the templates page, session edit (type, `toForm`, PATCH body) and adapt snapshot type carry `duration_seconds`.
- **API details.** `ExercisePatch` refuses `measure: null` (there is no unset measure); omitting it keeps the setting. The migration test asserts the chain has one head (`len(get_heads()) == 1`) and checks this revision's `down_revision`, so the next migration does not need to edit it.
- **Demo seed.** Plank (bodyweight, 3 × 45–75 s) and Farmer's carry (24 kg per hand, noted on the exercise, 3 × 30–45 s) close the Lower body template, under a new "Core" type. Their sets draw from their own RNG key, so every previously seeded value is unchanged.
- **Comparison panel test** is a new `SessionComparisonPanel.test.tsx`; `PlanVsActualCard` does not render the panel.
- **Migration round-trip on Postgres 16** (throwaway `pg-check` container, see `docs/memory/local-dev.md`): `upgrade head` from empty, `downgrade -1` (columns gone), `upgrade head`; an exercise inserted without `measure` reads `reps` throughout.
- **Log grid, backspacing a legacy time to blank (accepted).** The row flips to Reps with only the header and the placeholder as cues; that is the pure-function rule. Workout mode shows the stepper label change.
- **Library-loading window (accepted).** In workout mode a timed exercise's blank set shows Reps until `/exercises` arrives; blank sets then flip to Time, but anything typed meanwhile stays reps.
- **Not verified in a browser.** The local dev backend is not migrated and was left alone, so the Time stepper and the Settings control were checked by tests only, not visually on a phone.
- **Pre-existing:** `ruff check` reports 250 errors at HEAD (not ~230); this change adds none. One existing eslint warning in `StepsForm.tsx`.

---

### Definition of Done

- [x] `POST /sessions/strength` with `duration_seconds: 45` round-trips; `reps` + `duration_seconds`, `0`, `86401` and `45.5` → 422; same rules on template sets
- [x] Template versioning copies `duration_seconds` into history; plan-vs-actual rows carry planned and actual seconds; holds add no volume and stay out of progression, PRs and volume-by-tag
- [x] `exercises.measure` defaults to `reps`, round-trips `time`, PATCH switches it; invalid or null → 422
- [x] Last-session defaults and template prefill follow the exercise's current measure (no reps prefilled for a now-timed exercise)
- [x] Workout mode: Plank shows a Time stepper (±5 s, m:ss kept, − on blank stays blank); the done tab reads `45 s`; choosing Plank for an entry with reps typed leaves an empty Time stepper and posts `reps: null`; Finish with time `0` is refused with "Plank, set 2: time "0" must be 1–86400 seconds (or m:ss)."
- [x] Log page, template editor and session edit show `Time (s)` inputs for timed sets and send `duration_seconds`; an edit of a timed session keeps it
- [x] Drafts written before this change load with `duration: ''` (no draft version bump)
- [x] Text export shows `45 s`, `60 s × 10 kg @RPE 8`; AI context shows `3×45s`, `2×60s@20kg`
- [x] Demo seed produces Plank and Farmer's carry sessions with durations and no reps
- [x] Migration round-tripped on Postgres 16
- [x] `corepack pnpm lint`, `corepack pnpm build`, `corepack pnpm test`, `uv run --frozen pytest -q` green

### Review round (Opus reviewer, Codex Sol)

The spec was corrected first (`0a61979`); then:

| # | Finding | Verdict |
|---|---|---|
| 1 | Prefill copied the old kind: an exercise switched to Time still prefilled reps "40" (Reps input, fake volume) | Fixed: server matches `last-session-defaults` to the measure; template exercises carry `measure`, `templateToFormValues` converts |
| 2 | The remembered input kind could survive an exercise switch and disagree with the header (both reviewers) | Fixed: `useSetInputKind` removed; `inputKind` only; one input element per set, focus kept |
| 3 | `sanitizeDurationInput` turned `45.5` into `455` and `-5` into `5` | Fixed: such a keystroke or paste is ignored |
| 4 | Time stepper − from blank or 5 gave `0`, which blocked Finish | Fixed: blank |
| 5 | "Measured in" options under 44 px | Fixed: `min-h-11` |
| 6 | The `time` tag sat inside the truncated name | Fixed: beside it |
| 7 | Mixed unweighted list read `8, 45s` | Fixed: `8 reps, 45s` |
| 8 | Coverage gaps: prefill wiring end to end, demo seed template sets | Fixed: tests added, plus the two reproduced input-kind cases |
| — | A blank time after typing saves as an empty set | Rejected: a blank time is an empty set, like blank reps (spec corrected) |
| — | Log-page prefill replaces sets kept by `changeExercise` | Rejected: phase-8 behaviour, now stated in the spec |
| — | Library-loading window in workout mode | Accepted as-is (see Implementation Notes) |

Tests after the round: backend 470 (was 468), frontend 653 (was 647). `ruff` still 250 at HEAD level; lint, build green.

#### Round 2

No criticals or highs.

| # | Finding | Verdict |
|---|---|---|
| 1 | Cached last-session defaults (`staleTime: Infinity`) kept the old kind after a measure change (both reviewers) | Fixed: Settings create/update invalidate `['last-session-defaults']`; workout mode converts defaults with the measure (`newExerciseSets(defaults, measure)`) |
| 2 | `computeDiff` compared the converted form with the raw snapshot: a stale template prompted "Changed reps" every save, and "Update template" wiped the planned amount | Fixed: diff against the snapshot converted per exercise measure |
| 3 | All-blank defaults read "Last time: –, –, – reps" | Fixed: `formatSetList` is null without an amount; chooser falls back to "3 sets" |
| 4 | Pasting `45 s` or `1:30 ` from a read-only view was rejected | Fixed: trim spaces and a trailing `s` / ` s` first; full-width digits stay rejected |
| — | Log grid: backspacing a legacy time to blank flips the row to Reps with only header and placeholder as cues | Accepted as-is (spec'd pure-function behaviour) |

Tests after round 2: backend 470 (unchanged), frontend 658 (was 653). `ruff` 250, lint and build green.
