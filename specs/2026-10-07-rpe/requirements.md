# RPE
## Requirements

### Scope

Two changes that put all effort ratings on one scale.

1. **Session RPE on 1–10.** The session-level effort rating moves from an inverted 1–5 scale (1 = All-out, 5 = Very easy) to the standard RPE scale, where 10 is maximal effort. Existing rows are converted.
2. **Per-set RPE.** Each strength set can carry an optional RPE, stored in the DB and entered with one tap in workout mode.

---

### Key Decisions

**One axis for all RPE values**
Session RPE and set RPE both use 1–10, 10 = maximal effort. The AI context line `RPE=N/10` was wrong under the old scale and becomes correct without changes.

**Session RPE: five emoji options, wider storage range**
The session picker keeps five emoji options, now ordered easy → hard and emitting 2, 4, 6, 8, 10. The API accepts any integer 1–10, so finer input can be added later without a migration.

**Existing session values are converted, not reinterpreted**
`new = 12 − 2 × old`: All-out 1 → 10, Hard 2 → 8, Moderate 3 → 6, Easy 4 → 4, Very easy 5 → 2. Backward compatibility of the AI context output is not a concern; it is not consumed anywhere.

**Per-set RPE: 1–10 in half steps, optional, never prefilled**
Stored as a nullable float on `strength_sets`. Values must be multiples of 0.5. A set's RPE is never copied from the previous set or from the last session: it describes how that set felt.

**Workout mode: chips 6–10 plus a half-step toggle**
Sets below RPE 6 are rare in strength training, so workout mode offers chips `6 7 8 9 10` and a `.5` toggle. Tapping the selected chip clears it. The log page and the session edit form take a typed value and cover the full range.

**Templates unchanged**
Template sets get no RPE. A `target_rpe` on template sets is a possible follow-up.

---

### Out of Scope

- RPE-based analytics (per-exercise RPE trends, e1RM from RPE)
- RIR input (derivable as 10 − RPE)
- Renaming the session column
