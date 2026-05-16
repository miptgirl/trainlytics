# Phase 8 — Smart Logging & Athlete Readiness: Plan

## Task Groups

---

### Group 1 — DB Migrations ✅ DONE

1.1 Add `wellbeing` (integer, nullable) and `rpe` (integer, nullable) columns to `workout_sessions`  
1.2 Create `exercise_replacements` join table with `(exercise_id, replacement_id)` primary key and FK constraints with `ON DELETE CASCADE`  
1.3 Apply migrations locally; verify with `alembic upgrade head`

---

### Group 2 — Backend: Wellbeing & RPE ✅ DONE

2.1 Update `WorkoutSession` SQLAlchemy model with `wellbeing` and `rpe` fields  
2.2 Update `WorkoutSessionCreate` and `WorkoutSessionUpdate` Pydantic schemas to include optional `wellbeing: int | None` and `rpe: int | None` (validated range 1–5)  
2.3 Update `WorkoutSessionOut` schema to expose both fields  
2.4 Verify existing session create/update routes pass through the new fields without other changes

---

### Group 3 — Backend: Smart Exercise Defaults ✅ DONE

3.1 Add `GET /exercises/{exercise_id}/last-session-defaults` route in `exercises.py`  
3.2 Query `StrengthExerciseEntry` joined to `StrengthSession` → `WorkoutSession` for the current user, ordered by session date descending, limit 1  
3.3 Return `{ sets: [{ set_number, reps, weight_kg }] }` — or `{ sets: [] }` if no history  

---

### Group 4 — Backend: Exercise Replacements

4.1 Add `exercise_replacements` association table to `exercise.py` model (or a new `exercise_replacement.py` model file)  
4.2 Add `replacements` relationship on `Exercise` via the join table  
4.3 Update `ExerciseOut` schema to optionally include `replacements: list[ExerciseRef]` (id + name) when requested  
4.4 Add `GET /exercises/{id}/replacements` — list configured replacements for an exercise  
4.5 Add `POST /exercises/{id}/replacements` — body `{ replacement_id: int }`; insert row; return updated list  
4.6 Add `DELETE /exercises/{id}/replacements/{replacement_id}` — remove row; 404 if not found  
4.7 All three routes are user-scoped (verify ownership of the exercise before touching replacements)

---

### Group 5 — Frontend: Wellbeing & RPE

5.1 Create a reusable `EmojiRating` component: 5 emoji buttons, selected state highlighted, unselected muted; tapping a selected emoji deselects it (sets value to null)  
5.2 Add wellbeing and RPE rating rows to the strength log form, placed above the notes field; labels: "How are you feeling?" / "How hard was that?"  
5.3 Add the same rows to the cardio log form  
5.4 Wire both values into the session submit payload  
5.5 Display wellbeing and RPE in `StrengthSessionDetailPage` and `CardioSessionDetailPage` when values are set

---

### Group 6 — Frontend: Smart Exercise Defaults

6.1 In `LogWorkoutPage` strength form, after the user selects an exercise from the dropdown (ad-hoc path only, not template), call `GET /exercises/{id}/last-session-defaults`  
6.2 If the response contains sets, pre-populate the sets array; show a subtle hint "Filled from last session"  
6.3 If no history, leave the form at its current default (1 set, blank reps/weight)  
6.4 Pre-populated values remain fully editable

---

### Group 7 — Frontend: Exercise Replacements — Settings

7.1 In `ExercisesPage` (or the exercise edit modal/sheet), add a "Replacements" section below the existing fields  
7.2 Show a list of current replacements with a remove (✕) button per entry  
7.3 Add "Add replacement" button that opens a searchable exercise picker, with exercises grouped by type tag  
7.4 On selection, call `POST /exercises/{id}/replacements`; on remove, call `DELETE`  
7.5 Offer a "Also add reverse replacement?" confirm when adding (calls the same POST with IDs swapped)

---

### Group 8 — Frontend: Swap Control in Log Form

8.1 Add a swap icon button (⇄) to each exercise row in the strength log form  
8.2 Button is only visible if the exercise has at least one configured replacement (check `GET /exercises/{id}/replacements` or include replacements in the exercise list response)  
8.3 Tapping the button opens a modal/sheet listing the replacement exercises  
8.4 Selecting a replacement updates the exercise in the form row; sets/reps/weight are fetched from `GET /exercises/{id}/last-session-defaults` for the replacement exercise (same logic as smart defaults); blank sets used if no history  
8.5 Same swap control available in the template editor

---

### Group 9 — Frontend: Clear Notes Button

9.1 Create a small inline clear button (✕ icon) that appears when a textarea/input has content  
9.2 Apply to session-level notes field on the strength log form  
9.3 Apply to session-level notes field on the cardio log form  
9.4 Apply to per-set notes fields on strength sets in the log form  
9.5 Apply to notes field on the template editor  
9.6 Clicking clears the field value; focus returns to the field

---

### Group 10 — Integration & Polish

10.1 Update draft auto-save (Phase 6) to persist wellbeing/RPE values  
10.2 Verify session export text (Phase 6) includes wellbeing/RPE when set  
10.3 Smoke-test on mobile viewport: emoji scale tap targets, swap modal, clear button hit areas  
10.4 Update roadmap.md to mark Phase 8 complete
