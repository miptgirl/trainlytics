# Per-set RPE
## Requirements

### Scope

Each logged strength set can carry an RPE (rate of perceived exertion) value. It is optional, entered in one tap in workout mode, stored on the set, shown wherever sets are shown, and included in the text export and AI context. Nothing is prefilled: RPE is a judgement about the set just done.

Out of scope: target RPE on template sets, RPE-based analytics (e1RM estimates, RPE trends), RIR, and the existing session-level `rpe` field on `workout_sessions` (a separate change is updating it; this spec does not touch it).

---

### Key Decisions

**Standard 10-point scale, integers only**
`rpe` is an integer from 1 to 10. Half steps are not accepted for now.

**Chips 5–10 in workout mode**
The set editor shows chips `5 6 7 8 9 10`. Tapping a chip selects it, tapping the selected chip clears it. Values 1–4 are valid for the API and can be typed on the log page, but are not offered as chips: they are warm-up territory and would crowd the row on a phone.

**Always visible, no setting**
The RPE row is part of the workout-mode set editor for everyone. It is one row of chips, empty by default, and costs nothing when ignored. A "track RPE" preference can come later if it turns out to be noise for people who never use it.

**Never prefilled**
Unlike reps and weight, RPE is not copied from the previous set, the last session or a template. "Last time" summaries do not show it either.

**Name**
The set column is `rpe`, matching how athletes and the API already name the concept. The session-level `workout_sessions.rpe` is a different, 5-grade scale and is being revised separately.

---

### Behaviour

| Surface | Behaviour |
|---|---|
| Workout mode set editor | Third row under Weight: label "RPE", chips 5–10, tap to select, tap again to clear |
| Workout mode done-set row | Value appended to the compact label: `8 × 100 kg @8` |
| Log page set grid | New "RPE" column with a small integer input, hidden on narrow screens like Notes |
| Session detail page | "RPE" column in the read-only table and in the edit form |
| Text export | `@RPE 8` appended to a set line when present |
| AI context | `compact_sets` keeps sets with different RPE apart and appends `RPE8` to each group |
| Demo seed | Real `rpe` values on working sets instead of `RPE: 7` strings in notes |
| Draft recovery | `rpe` is part of the set draft; older drafts without it load with the field empty |

---

### Data

- `strength_sets.rpe INTEGER NULL`
- API: `StrengthSetCreate.rpe: int | None`, `ge=1, le=10`; `StrengthSetOut.rpe: int | None`
- Create and patch paths need no logic change: sets are built from `model_dump()`
