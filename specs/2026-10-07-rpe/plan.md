# Session RPE on 1–10
## Implementation Plan

### A. Session RPE on 1–10

A.1 Alembic migration `c3f8e1a2b9d4` (down `c7d8e9f0a1b2`, the per-set RPE migration): `UPDATE workout_sessions SET rpe = 12 - 2 * rpe WHERE rpe BETWEEN 1 AND 5`; downgrade maps back, rounds odd values and clamps to 1–5.

A.2 `schemas/session.py`: session `rpe` bounds `ge=1, le=10` on cardio and strength create/patch.

A.3 `EmojiOption` gets an explicit `value`. `WELLBEING_OPTIONS` keeps 1–5; `RPE_OPTIONS` is reordered easy → hard with values 2/4/6/8/10. `EmojiRating` and `EmojiRatingDisplay` look options up by value; `optionForValue` picks the nearest option for odd values.

A.4 `exportUtils`: effort label by value, with the number (`Effort: 😐 Moderate (6/10)`).

A.5 Analytics UI: `StatsGlance` shows `/10`; `ReadinessTrendsChart` plots RPE on its own right-hand axis (0–10) and draws the grid against the wellbeing axis; `WellbeingCorrelationChart` y domain 0–10.

A.6 Strength draft version 3 and cardio draft `version: 2`: older drafts load with session `rpe: null`.

A.7 Demo seed: session RPE by intent (easy cardio low, hard cardio high).

### B. Save-time checks and errors

B.1 `invalidSetRpeMessage` in `lib/strengthSession.ts` (integer 1–10 rule, via `parseSetRpe`). Called in `useStrengthSessionForm` before the template-diff prompt and before posting, in the session edit form's save, and in workout mode's Finish (which jumps to the exercise).

B.2 `api.ts` `formatErrorDetail`: FastAPI validation error lists become their joined `msg`s. The session edit page shows a failed save.

B.3 `PATCH /sessions/{id}` validates the type-specific body inside the handler; pydantic errors become a 422 with `("body", …)` locations instead of a 500.

B.4 `compact_sets`: an `rpe` from the unvalidated adapt-session snapshot is used only when it is a whole number.

### Tests

- Backend: session RPE bounds on create and patch (strength and cardio), PATCH 422 `loc`, the remap migration on SQLite, `compact_sets` with junk snapshot RPE, analytics on the new scale, seed session values.
- Frontend: option lookup by value, export labels, draft v2 → v3 and cardio draft versioning, the invalid-set-RPE refusal on the log page (collapsed exercise) and in workout mode, set-RPE-only changes not prompting a template update, `formatErrorDetail`, edit page error rendering.
