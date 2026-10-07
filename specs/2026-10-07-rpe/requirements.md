# Session RPE on 1–10
## Requirements

### Scope

1. **Session RPE on 1–10.** The session-level effort rating (`workout_sessions.rpe`) moves from an inverted 1–5 scale (1 = All-out, 5 = Very easy) to the standard RPE scale, where 10 is maximal effort. Existing rows are converted.
2. **Save-time checks and error messages** for session saves: set RPE is checked on the values being saved, and API validation errors reach the user as readable text.

Per-set RPE itself (`strength_sets.rpe`, workout-mode chips, log grid column) is specified in `specs/2026-10-07-per-set-rpe/`.

---

### Key Decisions

**One axis for all RPE values**
Session RPE uses the same 1–10 scale as per-set RPE, 10 = maximal effort. The AI context line, wrong under the old scale, now reads `session RPE=N/10` so it can't be confused with per-set `RPE8`.

**Five emoji options, wider storage range**
The session picker keeps five emoji options, now ordered easy → hard and emitting 2, 4, 6, 8, 10. The API accepts any integer 1–10, so finer input can be added later without a migration. Values without an option (odd numbers) display as the nearest option.

**Existing values are converted, not reinterpreted**
`new = 12 − 2 × old`: All-out 1 → 10, Hard 2 → 8, Moderate 3 → 6, Easy 4 → 4, Very easy 5 → 2. Stored drafts written under the old scale drop their session RPE on load.

**Set RPE is checked on values, not inputs**
React Hook Form skips validation for unmounted fields (collapsed exercise blocks, workout mode), and the payload builder turns an invalid set RPE into `null`. Saving therefore checks every set's RPE and refuses with a message naming the exercise and set, instead of dropping the value silently.

**Old clients are refused, not trusted**
A browser tab or installed PWA loaded before the deploy still sends the old scale (`rpe: 1` = All-out). Current clients send `X-Session-Rpe-Scale: 10`; a session create or PATCH with a non-null session `rpe` and without that header gets a 409 ("The app was updated. Reload the page and set effort again"). The old client keeps its draft; after a reload the new bundle drops the draft's old-scale `rpe`. Requests without a session `rpe`, and set-level `rpe`, are not affected. The check can be removed once no pre-1–10 clients can exist.

---

### Out of Scope

- RPE-based analytics (RPE trends, e1RM from RPE)
- Finer session RPE input than the five options
- Renaming the session column
