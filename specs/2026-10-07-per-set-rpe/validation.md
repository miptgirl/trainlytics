# Per-set RPE
## Validation

### Progress

| Task Group | Status |
|---|---|
| 1. Backend | ✅ Done — migration `c7d8e9f0a1b2`, model, schemas, `compact_sets`, demo seed |
| 2. Frontend form model and lib | ✅ Done — `SetFormValues.rpe`, draft parsing, payloads, `formatSet`, export |
| 3. Frontend UI | ✅ Done — chips in workout mode, RPE column on log page and session detail |
| 4. Tests | ✅ Done — backend 334 → 342, frontend 363 → 373 |
| 5. Docs | ✅ Done — roadmap entry |

---

### Implementation Notes

- **Template editor has no RPE column.** `ExerciseEntryBlock` is shared with templates, so the column is behind a `showRpe` prop; `StrengthExerciseList` (sessions only) turns it on.
- **Phones hide the log-page RPE field entirely.** Below `sm` both header and input are hidden; workout mode is the phone entry point. Notes, by contrast, only hides its header and wraps to a second line.
- **Out-of-range values never reach the API.** `parseSetRpe` maps anything that is not an integer 1–10 (e.g. a hand-edited draft) to `null`; the log-page input also clamps typing (`11` → `1`, `0` → empty). Saving now catches such a value first and refuses with a message naming the exercise and set, rather than sending `null` (see `specs/2026-10-07-rpe/`).
- **Chips are 5–10, integers only**, per the decision in `requirements.md`; the API accepts 1–10.
- **Selected chip style** reuses the `EmojiRating` tokens (primary border, tinted background, bold). On the editor's tinted background the fill is subtle; the border and weight carry the state. A solid `primary-dark` fill is the fallback if this reads as too quiet on a real phone.
- **Not touched:** session-level `workout_sessions.rpe` and its AI context line (another branch revised both: 1–10 scale, labelled `session RPE=N/10`), template sets, `last-session-defaults`, adapt/diff snapshots.
- **Pre-existing:** `ruff check` reports 230 errors at HEAD; this change adds none. One existing eslint warning in `StepsForm.tsx`.

---

### Definition of Done

- [x] `POST /sessions/strength` with `rpe: 8` on a set stores and returns it; `0`, `11`, `7.5` → 422
- [x] Workout mode: tap chip 8 → done row reads `1 × 5 kg @8`; next set starts unrated; tapping the selected chip clears it
- [x] Drafts written before this change load with RPE empty (no draft version bump)
- [x] Text export shows `@RPE 8`; AI context shows `RPE8` and keeps sets with different RPE apart
- [x] Demo seed produces real `rpe` values and no `RPE: N` notes
- [x] `pnpm lint`, `pnpm build`, `pnpm test`, `uv run pytest -q` green

### Review round (PR #31)

Five findings, all fixed:

| # | Finding | Fix |
|---|---|---|
| 1 | Phones could not see or edit set RPE on the log and edit pages | Line 2 of a phone set row is now `Note · RPE · Delete`; the field carries a phone-only "RPE" prefix since line 2 has no header |
| 2 | Workout mode hid typed values 1–4 | Label reads `RPE · 4` with a Clear button; chips still replace it |
| 3 | Selected chip barely stood out on the tinted editor | Solid `primary-dark` fill, white text |
| 4 | Chips ~43px wide at 375px | Chip gap 6px → 4px (≈45px) |
| 5 | Done sets did not strike the RPE input through | Same `sm:line-through` as reps and weight |

Screenshots: `review-workout-selected-chip.jpg`, `review-workout-rpe-4-clear.jpg`, `review-log-page-phone.png`, `review-edit-page-phone.jpg`, `review-log-page-tablet.png`. Tests: 377 frontend (was 373).

### Verified in the browser (2026-10-07, Chromium 375×812)

Worktree frontend against the local backend as `demo`: the RPE row sits under Weight with six chips that fit the phone width at ≥44px tall; selecting 8 and completing the set shows `1 × 5 kg @8` on the done row and an unrated set 2. The running backend was not migrated, so persistence was checked by pytest, not end to end.
