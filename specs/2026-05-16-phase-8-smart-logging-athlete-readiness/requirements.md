# Phase 8 — Smart Logging & Athlete Readiness: Requirements

## Goal

Logging a session becomes smarter and more personalized — exercises come pre-filled with last-session weights, swaps are one tap away, and the app captures how the athlete felt before and after each session.

---

## Deliverables

### 1. Wellbeing & RPE Capture

Two optional 5-grade emoji icon scales added to the strength and cardio log forms, placed near (above) the notes field. Both scales use the same emoji set (😫 😞 😐 🙂 😄) left-to-right, but the per-grade descriptions differ because the questions mean different things:

**Pre-training wellbeing** — "How are you feeling?" (how you feel going in):

| Emoji | Grade | Description |
|---|---|---|
| 😫 | 1 | Exhausted |
| 😞 | 2 | Not great |
| 😐 | 3 | Okay |
| 🙂 | 4 | Good |
| 😄 | 5 | Great |

**Post-session RPE** — "How hard was that?" (perceived effort):

| Emoji | Grade | Description |
|---|---|---|
| 😫 | 1 | All-out effort |
| 😞 | 2 | Hard |
| 😐 | 3 | Moderate |
| 🙂 | 4 | Easy |
| 😄 | 5 | Very easy |

Descriptions are shown as tooltips or small labels beneath each emoji so the meaning is unambiguous.

**Storage:** Two new nullable integer columns on `workout_sessions`:
- `wellbeing` — integer 1–5, nullable
- `rpe` — integer 1–5, nullable

Both fields are optional. Backed by Alembic migration.

Displayed in session detail views when set.

### 2. Smart Exercise Defaults

When adding a **new** exercise to a strength log form (not via a loaded template), the sets/reps/weight fields are pre-filled from the most recent logged session that included that exercise.

**Scope:** Applies only when adding exercises ad-hoc (not pre-filled from template). Template values are unchanged — the template remains the source of truth for template-based sessions.

**Backend:** New endpoint `GET /exercises/{exercise_id}/last-session-defaults` returns `{ sets: [...{ reps, weight_kg }] }` from the most recent `StrengthExerciseEntry` for the current user with that exercise. Returns 404 or empty if no history exists.

**Frontend:** After the user picks an exercise from the dropdown in the strength log form (non-template path), call the endpoint and pre-populate the sets. User can override freely before saving.

### 3. Exercise Replacements

Users define a curated list of replacement exercises per exercise in Settings / Manage Exercises.

**Storage:** New join table `exercise_replacements`:
- `exercise_id` (FK → exercises.id)
- `replacement_id` (FK → exercises.id)
- Unique constraint on `(exercise_id, replacement_id)`
- Replacements are directional: adding B as a replacement of A does not automatically make A a replacement of B (UI should offer to do both)

**Settings UI:** In the exercise detail/edit view, a "Replacements" section lists configured replacements and offers an "Add replacement" picker. The picker groups candidate exercises by their existing type tags to help discovery.

**Log form swap control:** In the strength log form (template or ad-hoc), each exercise row gets a swap icon (⇄). Tapping it opens a bottom sheet / modal showing that exercise's configured replacements. Selecting one replaces the exercise in the form; sets/reps/weight are fetched from the most recent logged session for the replacement exercise (same smart-defaults logic as Group 3) — blank sets if no history exists. If no replacements are defined, the swap icon is hidden.

**Backend endpoints:**
- `GET /exercises/{exercise_id}/replacements` — list configured replacements
- `POST /exercises/{exercise_id}/replacements` — add a replacement `{ replacement_id }`
- `DELETE /exercises/{exercise_id}/replacements/{replacement_id}` — remove a replacement

### 4. Clear Notes Button

A small icon button (✕ or trash icon) placed inline next to the notes field, visible only when the field has content.

**Scope — all three note contexts:**
- Session-level notes on strength and cardio log forms
- Per-set notes on individual strength sets in the log form
- Template notes when editing a strength template

Clicking the button clears the field value in one tap without requiring text selection.

---

## Key Decisions

| Question | Decision |
|---|---|
| Icon style for wellbeing/RPE | Emoji faces (😫 😞 😐 🙂 😄) |
| Default source when logging from template | Template values unchanged; last-session defaults only apply when adding new exercises ad-hoc |
| Replacements storage | Explicit join table `exercise_replacements`; type tags used in UI for candidate discovery only |
| Clear notes scope | Session notes + per-set notes + template notes |

---

## DB Schema Changes

```sql
-- workout_sessions
ALTER TABLE workout_sessions ADD COLUMN wellbeing INTEGER;
ALTER TABLE workout_sessions ADD COLUMN rpe INTEGER;

-- exercise_replacements (new table)
CREATE TABLE exercise_replacements (
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    replacement_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    PRIMARY KEY (exercise_id, replacement_id)
);
```

Both changes delivered via Alembic migrations.

---

## API Summary

| Method | Path | Purpose |
|---|---|---|
| PATCH | `/sessions/{id}` | Existing; now accepts `wellbeing` and `rpe` |
| POST | `/sessions` | Existing; now accepts `wellbeing` and `rpe` |
| GET | `/exercises/{id}/last-session-defaults` | Smart defaults for exercise |
| GET | `/exercises/{id}/replacements` | List replacements |
| POST | `/exercises/{id}/replacements` | Add replacement |
| DELETE | `/exercises/{id}/replacements/{rid}` | Remove replacement |

---

## Constraints & Non-Goals

- Wellbeing/RPE are display-only in session detail; not used in analytics until Phase 9 (AI insights)
- Smart defaults do not override template values
- Exercise replacements are user-curated; no auto-suggestion from the backend
- Replacements are directional; the UI offers a "add reverse too" convenience but does not enforce symmetry
