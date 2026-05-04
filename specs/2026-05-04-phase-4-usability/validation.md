# Phase 4 — Validation

The implementation is complete and mergeable when all of the following pass.

---

## Database Migrations

- [x] `exercise_types` table exists with columns: `id`, `user_id`, `name`, `created_at`
- [x] `exercise_exercise_types` join table exists with foreign keys to `exercises` and `exercise_types`, both with `ON DELETE CASCADE`
- [x] All Alembic migrations apply cleanly on a fresh database (`alembic upgrade head`)
- [x] Deleting an exercise also removes its rows from `exercise_exercise_types`
- [x] Deleting an exercise type also removes its rows from `exercise_exercise_types`

---

## Backend — Exercise Types API

- [x] `GET /exercise-types` returns only the current user's exercise types
- [x] `POST /exercise-types` creates a type scoped to the current user; returns `id`, `name`, `created_at`
- [x] `PATCH /exercise-types/{id}` updates the name; returns 404 if the type belongs to another user
- [x] `DELETE /exercise-types/{id}` removes the type; returns 404 if the type belongs to another user
- [x] User A cannot see, edit, or delete User B's exercise types — *verified by `test_exercise_types_user_isolation`*

---

## Backend — Exercise API Updates

- [x] `POST /exercises` with `type_ids: [1, 2]` creates the exercise and links both types
- [x] `GET /exercises` response includes `types: [{ id, name }]` for each exercise
- [x] `PATCH /exercises/{id}` with `type_ids: [3]` replaces the previous type associations
- [x] `PATCH /exercises/{id}` with `type_ids: []` removes all type associations
- [x] Passing a `type_id` belonging to another user returns a 400 or 404 error
- [x] All existing exercise tests still pass

---

## Deployment Script

- [x] `scripts/deploy.sh` exists and is executable
- [x] Running the script on a clean checkout performs: `git pull`, `docker compose ... up --build -d`, `alembic upgrade head` — in that order
- [x] `README.md` contains a **Deployment** section documenting the script

---

## Mobile Header

- [x] On a 375 px wide viewport, all nav links and the Sign Out button are accessible without horizontal scrolling or element overlap
- [x] The logo is visible and not clipped on mobile
- [x] On a desktop viewport (≥ 1024 px), the nav layout is unchanged from Phase 3

---

## `TimeInput` Component

- [ ] Duration fields (cardio segment duration, cardio session total, strength session duration) display values as `h:mm:ss` or `m:ss`
- [ ] Pace fields display values as `m:ss` per km
- [ ] Entering `1:05:30` in a duration field submits `3930` seconds to the API
- [ ] Entering `5:30` in a pace field submits `330` seconds-per-km to the API
- [ ] Entering an invalid string (e.g. `"abc"`) shows an inline validation error and does not submit
- [ ] Existing sessions load and display their stored values correctly in the new format
- [ ] `TimeInput` unit tests pass (valid/invalid parse cases, format round-trip)

---

## Exercise Picker Grouped by Type

- [ ] In the strength log form, exercises are grouped by type with `<optgroup>` labels (or equivalent)
- [ ] In the template editor, the same grouping is applied
- [ ] Exercises with no type appear in an *"Uncategorised"* group
- [ ] An exercise with two types appears in both groups
- [ ] Grouping is correct immediately after a new exercise type is created (cache invalidation works)

---

## Template Form UX

- [ ] The "Add Exercise" button appears **below** the last exercise block in the template editor
- [ ] Each exercise block in the template editor has a chevron toggle that collapses/expands it
- [ ] Collapsed state shows exercise name and a set-count summary (e.g. "3 sets")
- [ ] The strength log form also has collapsible exercise blocks
- [ ] Completing all sets in a strength log exercise block causes it to auto-collapse
- [ ] Un-ticking a set in a collapsed block re-expands it

---

## Strength Log UX Polish

- [ ] Completed sets in the strength log form are highlighted in green (not muted/grey)
- [ ] Logging from a template pre-fills the title field with the template name
- [ ] Logging strength without a template pre-fills the title with `"Strength session"`
- [ ] Manually editing the title field prevents it from being overwritten by the default

---

## Cardio Auto-fill Title

- [ ] Opening the cardio log form pre-fills the title with `"<Activity type> – <X> km"` using the default activity type and 0 km
- [ ] Changing the activity type updates the title (if not manually edited)
- [ ] Changing the distance updates the title (if not manually edited)
- [ ] Manually editing the title field prevents further auto-updates

---

## Exercise Types in Settings

- [ ] The Settings page has an **Exercise Types** section with the same create/edit/delete UI as Activity Types
- [ ] The exercise create/edit form includes a multi-select for exercise types
- [ ] Selecting types on an exercise saves them correctly (`type_ids` sent in create/patch)
- [ ] Deleting an exercise type from Settings is reflected immediately in the exercise picker (no stale data)
