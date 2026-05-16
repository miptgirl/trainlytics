# Phase 8 — Smart Logging & Athlete Readiness: Validation

## Definition of Done

A user can open the log form, rate how they feel with an emoji tap, pick an exercise and see last session's weight already filled in, swap it for a replacement if needed, and clear their notes without selecting all text manually.

---

## Acceptance Criteria by Deliverable

### Wellbeing & RPE

- [x] Strength log form shows two emoji rows (wellbeing + RPE) above the notes field
- [x] Cardio log form shows the same two rows
- [x] Selecting an emoji highlights it; tapping again deselects (value becomes null)
- [x] Submitted session payload includes `wellbeing` and `rpe` (null when not selected)
- [x] `workout_sessions` table has `wellbeing` and `rpe` integer columns (confirmed via `\d workout_sessions` or Alembic history)
- [x] Session detail view shows wellbeing and RPE when set; nothing shown when null
- [x] Both fields absent from the form do not break existing session submissions

### Smart Exercise Defaults

- [x] Adding an exercise ad-hoc to the strength log form triggers a call to `GET /exercises/{id}/last-session-defaults`
- [x] If history exists, sets/reps/weight are pre-populated; a "Filled from last session" hint is visible
- [x] Pre-populated values are fully editable before submission
- [x] Loading from a template still uses template values; smart defaults do not fire for template exercises
- [x] If no history exists, the form shows the existing default (1 blank set) with no hint
- [x] `GET /exercises/{id}/last-session-defaults` endpoint implemented — returns `{ sets: [{set_number, reps, weight}] }` from the most recent session, or `{ sets: [] }` when no history exists; scoped to the current user; 404 on unknown/unauthorized exercise

### Exercise Replacements

- [x] `exercise_replacements` table exists with correct FK and unique constraints
- [x] `GET /exercises/{id}/replacements` — returns list of replacement exercises (id + name), scoped to current user
- [x] `POST /exercises/{id}/replacements` — adds a replacement; returns updated list; 400 on self-replacement; 409 on duplicate; 404 on unknown/unauthorized exercise
- [x] `DELETE /exercises/{id}/replacements/{rid}` — removes replacement; returns updated list; 404 if not found
- [ ] Settings / Manage Exercises shows a "Replacements" section for each exercise
- [ ] Adding a replacement calls `POST /exercises/{id}/replacements` and updates the list
- [ ] The "add replacement" picker groups exercises by type tag
- [ ] Removing a replacement calls `DELETE /exercises/{id}/replacements/{rid}`
- [ ] "Also add reverse?" prompt is offered and works correctly
- [ ] Swap icon (⇄) appears on exercise rows in the strength log form only for exercises that have replacements
- [ ] Tapping swap opens a list of configured replacements
- [ ] Selecting a replacement swaps the exercise; sets/reps/weight are loaded from the most recent session for the replacement exercise (not copied from the swapped-out row)
- [ ] If no session history exists for the replacement, the form shows blank sets
- [ ] Swap also works in the template editor
- [ ] Exercises with no replacements show no swap icon

### Clear Notes Button

- [ ] Clear button (✕) appears next to the session notes field when it has content
- [ ] Clear button appears next to per-set notes fields when they have content
- [ ] Clear button appears next to template notes field when it has content
- [ ] Clicking clear empties the field in one tap
- [ ] Button is not visible when the field is empty

---

## DB Validation

Run after migrations:

```sql
-- Confirm new columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'workout_sessions'
  AND column_name IN ('wellbeing', 'rpe');

-- Confirm replacements table
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'exercise_replacements';
```

---

## Regression Checks

- Existing strength and cardio session creation/editing still works with no wellbeing/RPE set
- Template loading pre-populates exercises from template (not last session)
- Session export text (Phase 6) remains correct for old sessions without wellbeing/RPE
- Weekly summary and training trends (Phase 3) unaffected
- Pace trends chart and steps overlay (Phase 7) unaffected
- Draft auto-save and restore (Phase 6) continue to work for strength sessions with the new fields

---

## Mobile Smoke Test

- [ ] Emoji tap targets are large enough on iPhone-sized viewport (≥ 44px touch area)
- [ ] Swap modal is usable on narrow screens
- [ ] Clear button hit area does not conflict with adjacent controls
- [ ] No horizontal overflow introduced by new UI elements
