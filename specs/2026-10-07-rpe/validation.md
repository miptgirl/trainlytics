# RPE
## Validation

### Progress

| Task Group | Status |
|---|---|
| A. Session RPE on 1–10 | ✅ |
| B. Per-set RPE | ✅ |
| Tests | ✅ |

---

### Definition of Done

- [x] Existing session RPE values converted by the migration; downgrade restores them
- [x] Session pickers read easy → hard and save 2/4/6/8/10
- [x] A set's RPE can be entered in workout mode with one or two taps, and on the log and edit pages
- [x] Set RPE is saved, shown on the session detail page, in the text export and in the AI context
- [x] Backend and frontend test suites, lint and type check pass (ruff: no new findings; the backend had 230 pre-existing ones, now 229)

---

### Implementation Notes

- **Migrations.** `c3f8e1a2b9d4` remaps session RPE (`12 − 2 × old`); `d4a9b7c2e6f1` adds `strength_sets.rpe`. The remap downgrade is exact for even values; odd values (enterable only after the upgrade) round half away from zero (7 → 3, Moderate), and the result is clamped to 1–5 with `CASE` because SQLite has no `GREATEST`/`LEAST`. Both were run up, down and up on Postgres 16.
- **Odd session values** display as the nearest emoji option, ties to the lower one (7 → Moderate), the same way the downgrade rounds. `optionForValue` in `emojiRatingOptions.ts` does this for the display and the text export.
- **Drafts.** Strength drafts below v3 and unversioned cardio drafts (cardio drafts now carry `version: 2`) load with session `rpe: null`, because their 1–5 values meant the opposite. A missing set `rpe` loads as `''`, so no version bump was needed for Part B.
- **PATCH validation.** `PATCH /sessions/{id}` validates its body inside the handler, so pydantic errors used to surface as 500. They now return 422 like the create endpoints, which the set RPE bounds rely on.
- **Log page grid.** The RPE header is hidden below `sm` like Notes; the input sits on the second mobile row before the note (the wrapper is `display: contents` from `sm` up). The template editor shares `ExerciseEntryBlock` and passes `showRpe={false}`.
- **Workout mode chips.** Selected chips use a `primary-dark` fill rather than the design system's `primary-tint` chip, because the set editor's background is already `primary-tint`.
