# Session RPE on 1–10
## Requirements

### Scope

1. **Session RPE on 1–10.** The session-level effort rating (`workout_sessions.rpe`) moves from an inverted 1–5 scale (1 = All-out, 5 = Very easy) to the standard RPE scale, where 10 is maximal effort. Existing rows are converted.
2. **Save-time checks and error messages** for session saves: set RPE is checked on the values being saved, and API validation errors reach the user as readable text.

Per-set RPE itself (`strength_sets.rpe`, workout-mode chips, log grid column) is specified in `specs/2026-10-07-per-set-rpe/`.

---

### Key Decisions

**One axis for all RPE values**
Session RPE uses the same 1–10 scale as per-set RPE, 10 = maximal effort. The AI context line `RPE=N/10` was wrong under the old scale and becomes correct without changes.

**Five emoji options, wider storage range**
The session picker keeps five emoji options, now ordered easy → hard and emitting 2, 4, 6, 8, 10. The API accepts any integer 1–10, so finer input can be added later without a migration. Values without an option (odd numbers) display as the nearest option.

**Existing values are converted, not reinterpreted**
`new = 12 − 2 × old`: All-out 1 → 10, Hard 2 → 8, Moderate 3 → 6, Easy 4 → 4, Very easy 5 → 2. Stored drafts written under the old scale drop their session RPE on load.

**Set RPE is checked on values, not inputs**
React Hook Form skips validation for unmounted fields (collapsed exercise blocks, workout mode), and the payload builder turns an invalid set RPE into `null`. Saving therefore checks every set's RPE and refuses with a message naming the exercise and set, instead of dropping the value silently.

---

### Out of Scope

- RPE-based analytics (RPE trends, e1RM from RPE)
- Finer session RPE input than the five options
- Renaming the session column
