# RPE
## Implementation Plan

### Part A — Session RPE on 1–10

A.1 Alembic migration: `UPDATE workout_sessions SET rpe = 12 - 2 * rpe WHERE rpe IS NOT NULL`; downgrade maps back and clamps to 1–5.

A.2 `schemas/session.py`: session `rpe` bounds `ge=1, le=10` on cardio and strength create/patch.

A.3 `EmojiOption` gets an explicit `value`. `WELLBEING_OPTIONS` keeps 1–5; `RPE_OPTIONS` is reordered easy → hard with values 2/4/6/8/10. `EmojiRating` and `EmojiRatingDisplay` look options up by value; the display picks the nearest option for values without one (odd numbers).

A.4 `exportUtils`: effort label by value, with the number (`Effort: 😐 Moderate (6/10)`).

A.5 Analytics UI: `StatsGlance` shows `/10`; `ReadinessTrendsChart` plots RPE on its own right-hand axis (0–10); `WellbeingCorrelationChart` y domain 0–10.

A.6 Strength draft version 3: drafts with an older version load with `rpe: null`. Same for cardio drafts if they persist `rpe`.

A.7 Demo seed: session RPE by intent (easy cardio low, hard cardio high).

### Part B — Per-set RPE

B.1 Alembic migration: `strength_sets.rpe` nullable float.

B.2 Schemas: `StrengthSetCreate.rpe: float | None`, 1–10, multiple of 0.5; `StrengthSetOut.rpe`.

B.3 AI context: `compact_sets` keys on (reps, weight, rpe) and prints the RPE, so sets differing only in RPE are not merged.

B.4 Frontend form model: `SetFormValues.rpe: string` through `emptySet`, draft parsing, payload building, session → form conversion. Last-session defaults never carry RPE.

B.5 Workout mode `SetEditor`: an RPE row of chips with a `.5` toggle; done-set rows and `formatSet` show `@8.5`.

B.6 Log page set grid and session detail page (view and edit): an RPE column with a typed input, step 0.5, hidden on narrow screens like Notes.

B.7 `exportUtils`: per-set RPE in the text export.

B.8 Demo seed: real per-set RPE values replace the `"RPE: N"` set notes.

### Tests

- Backend: migration-independent schema validation (bounds, half steps), set RPE round-trip on create and patch, `compact_sets` keeps different RPE apart, analytics tests on the new scale.
- Frontend: option lookup by value, export labels, draft v2 → v3 nulls session RPE, set RPE through draft/payload, `formatSet`, chip behaviour in workout mode.
