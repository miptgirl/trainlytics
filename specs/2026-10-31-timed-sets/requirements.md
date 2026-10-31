# Timed sets
## Requirements

### Scope

Some exercises are held or carried for a time rather than counted in reps: planks, wall sits, dead hangs, farmer's carries, L-sits. Today every strength set is `reps × weight`, so these are logged as fake reps or as notes. After this change:

- An exercise declares how it is measured: in **reps** (today's behaviour, the default) or in **time**.
- A set of a timed exercise stores a **duration in seconds** instead of reps. Weight stays optional and independent (weighted plank, farmer's carry).
- Timed sets are entered in workout mode and on the log page, saved in templates, carried into template history, shown wherever sets are shown, and included in the text export, the AI context and plan-vs-actual.

Out of scope for this change (each is a candidate follow-up):

- An in-set countdown in workout mode that auto-completes the set when the hold is over.
- Analytics for timed exercises (best hold per exercise, time under load per week). Timed sets are excluded from the existing kg × reps charts by construction; see *Analytics* below.
- Per-set override of the measure (an exercise that is sometimes AMRAP-in-60-s is a second exercise).
- Distance-measured exercises (sled push for 20 m).

---

### Key Decisions

**The exercise's `measure` is a default, not an invariant**
`exercises.measure` is `reps` or `time`. It decides which input the forms show and what gets prefilled. The set row is the source of truth: a set logged while the exercise was timed keeps its `duration_seconds` after the exercise is switched back to reps, and every read path (detail, export, diff, plan-vs-actual, AI) looks at the set's values, never at the exercise flag. Changing an exercise's measure never rewrites history and never invalidates a template.

**A set carries reps or a duration, never both**
`strength_sets.duration_seconds INTEGER NULL`, same on template and template-history sets. A set with both `reps` and `duration_seconds` is refused (422). Both null stays allowed, as it is today for an empty set. This keeps every `weight × reps` computation honest without a special case.

**Why not seconds in the `reps` column**
Cheapest to build, but `weight × reps` volume, PRs, volume-by-tag and plan-vs-actual would all silently count seconds as reps. Rejected.

**Seconds, not `m:ss`, as the input**
Holds are typically 20–180 s. Both the workout-mode stepper and the log-page grid take whole seconds on a numeric keyboard; the stepper moves by 5 s. Because read-only surfaces show `1:30` from a minute up, a typed `m:ss` is accepted too (`parseDuration` mirrors `parseRestInput`: `90` or `1:30` → 90), so a user who copies what they see does not get 130 s. Valid range 1–86400 s; `0`, a blank-after-typing or an out-of-range value blocks the save with a message naming the exercise and set, the way an invalid per-set RPE does. The cardio `h:mm:ss` input (`TimeInput`) stays where it is.

**Which input a set shows, and converting between reps and time**
A set with a duration shows the Time input; a set with reps shows the Reps input; a set with neither follows its exercise's `measure`. Editing the shown field clears the other one, so a set can never hold both. Switching an entry to an exercise with a different measure (workout-mode "Choose exercise", the log-page picker) clears the mismatched field on all of its sets and keeps weight, notes, RPE and done; "Add set" copies the last set's reps *or* duration, so it inherits the right kind. A set logged while its exercise was timed, opened after the exercise went back to reps, still shows its duration and stays editable.

**Weight keeps its own meaning**
A timed set's `weight` is the load held or carried; a bodyweight hold leaves it empty. Nothing is derived from `weight × duration`.

**Name**
`measure` on the exercise, `duration_seconds` on the set: `duration_seconds` is what cardio segments and strength sessions already call a span of seconds.

---

### Behaviour

| Surface | Behaviour |
|---|---|
| Settings › Exercises | "Measured in" control with **Reps** / **Time** next to the weight-steps control, on create and edit; default Reps |
| Workout mode set editor | For a timed exercise the Reps stepper becomes a **Time** stepper: whole seconds, ±5 s, numeric keyboard, unit "s". Weight and RPE unchanged. A done set of a timed exercise reads `45 s × 20 kg @8` or `1:30` |
| Workout mode set tabs, "Last time", "Today", Choose-exercise rows | Timed sets read `45s`, `45s×20`, `1:30`; a list mixing reps and time keeps the unit per item (`8×60, 45s`) |
| Log page set grid | For a timed exercise the Reps column is a **Time (s)** column: whole seconds, numeric keyboard. Same header swap on phones |
| Template editor | Same column swap as the log page; template sets store `duration_seconds` |
| Session detail page | Reps column shows `45 s` / `1:30` for a timed set (`—` when empty); the edit form behaves like the log page |
| Add set, last-session defaults, template prefill | Copy `duration_seconds` the way reps are copied today |
| Diff against template | "Changed time on Plank set 2" |
| Plan vs actual | Set rows carry planned and actual duration; the comparison panel shows `45 s` in the reps cell and counts a row with only a duration as a real set (today it counts reps-or-weight); volume is unchanged (timed sets contribute 0) |
| Text export | `Plank: 45 s, 60 s × 10 kg @RPE 8` style lines; reps lines unchanged |
| AI context | `compact_sets` keeps timed sets apart from reps sets and renders `3×45s`, `2×60s@20kg`; bodyweight holds omit `@0kg` |
| Adapt-session snapshot | Carries `duration_seconds` per set |
| Demo seed | Two timed exercises ("Plank", "Farmer's carry") with a few sessions each |
| Draft recovery | `duration` is part of the set draft; older drafts load with it empty (no draft version bump) |
| Existing sets whose exercise changed measure | The editor shows whichever value the set holds; a new set follows the exercise's current measure (see *Which input a set shows*) |
| Switching an entry to an exercise of the other measure | Reps (or duration) cleared on its sets; weight, notes, RPE, done kept |
| Invalid duration | Save refused with "Plank, set 2: time "0" must be 1–86400 seconds (or m:ss)." |

---

### Analytics

Every strength analytics query filters `StrengthSet.reps IS NOT NULL` (progression, PRs, volume-by-tag, weekly volume, plan-vs-actual volume), and the history-list `total_volume` uses `(reps or 0)`. Timed sets therefore drop out of all of them without a code change, which is the correct v1 result: there is no kg × reps volume for a hold. The visible gap is that a user who mostly does holds sees no progression for them; the follow-up is a best-hold PR per timed exercise and time-under-load per week.

---

### Data

- `exercises.measure VARCHAR(10) NOT NULL DEFAULT 'reps'` — `reps` | `time`
- `strength_sets.duration_seconds INTEGER NULL`
- `strength_template_sets.duration_seconds INTEGER NULL`
- `strength_template_history_sets.duration_seconds INTEGER NULL`
- API: `ExerciseCreate.measure`, `ExercisePatch.measure`, `ExerciseOut.measure` (`Literal["reps", "time"]`, default `reps`)
- API: `StrengthSetCreate.duration_seconds: int | None`, `ge=1, le=86400`; `StrengthSetOut.duration_seconds`; same on `StrengthTemplateSetCreate` / `Out`; a model validator rejects a set with both `reps` and `duration_seconds`
- API: `SetDefault.duration_seconds` (last-session defaults); `SetComparisonRow.planned_duration_seconds` / `actual_duration_seconds`
- Template versioning copies `duration_seconds` into history sets
