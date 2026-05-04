# Phase 4 — Implementation Plan

Each group is a shippable unit. Complete them in order — later groups may depend on earlier ones.

---

## Group 1 — Exercise Types: Database & Backend ✅ DONE

1. Add Alembic migration: create `exercise_types` table (`id`, `user_id VARCHAR NOT NULL`, `name VARCHAR(255) NOT NULL`, `created_at TIMESTAMPTZ`).
2. Add Alembic migration: create `exercise_exercise_types` join table (`exercise_id INTEGER → exercises.id ON DELETE CASCADE`, `exercise_type_id INTEGER → exercise_types.id ON DELETE CASCADE`, primary key on both columns).
3. Create `ExerciseType` SQLAlchemy model (`app/models/exercise_type.py`) — mirrors `CardioActivityType`.
4. Add `exercise_types` many-to-many relationship to the `Exercise` model via `exercise_exercise_types`.
5. Create Pydantic schemas (`app/schemas/exercise_type.py`): `ExerciseTypeCreate`, `ExerciseTypeOut`, `ExerciseTypePatch`.
6. Update `ExerciseOut` schema to include `types: list[ExerciseTypeOut]`.
7. Update `ExerciseCreate` / `ExercisePatch` schemas to accept `type_ids: list[int]` (optional, defaults to `[]`).
8. Create `app/api/exercise_types.py` router: `GET /exercise-types`, `POST /exercise-types`, `PATCH /exercise-types/{id}`, `DELETE /exercise-types/{id}` — mirrors `cardio_types.py` exactly.
9. Update `app/api/exercises.py`: on create/patch, resolve `type_ids` to `ExerciseType` rows (scoped to `user_id`) and update the join table.
10. Register the new router in `app/main.py`.
11. Write tests in `tests/test_exercise_types.py`: CRUD, user isolation, delete cascades through join table.
12. Update `tests/test_exercises.py`: include `type_ids` in create/patch fixtures; assert `types` is returned in `ExerciseOut`.

---

## Group 2 — Deployment Script ✅ DONE

1. Create `scripts/` directory at the repo root.
2. Create `scripts/deploy.sh`:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   git pull
   docker compose -f docker-compose.prod.yml up --build -d
   docker compose -f docker-compose.prod.yml exec backend uv run alembic upgrade head
   echo "Deploy complete."
   ```
3. Make the script executable (`chmod +x scripts/deploy.sh`).
4. Add a **Deployment** section to `README.md` and `tech-stack.md` documenting the script and prerequisites.

---

## Group 3 — Mobile Header Fix ✅ DONE

1. Audit `Layout.tsx` on a 375 px viewport — identify the exact overflow/overlap.
2. Implement a responsive nav: on mobile, collapse nav links behind a hamburger button; on desktop (≥ `md` breakpoint) keep the current horizontal layout.
3. Verify the logo, nav links, and Sign Out button are all reachable on a 375 px screen.
4. Smoke-test the desktop layout is unchanged.

---

## Group 4 — Shared `TimeInput` Component ✅ DONE

1. Create `frontend/src/components/TimeInput.tsx`:
   - Props: `value: number | null` (seconds), `onChange: (seconds: number | null) => void`, `format: 'duration' | 'pace'`, optional `placeholder`.
   - Displays the value as `h:mm:ss` (duration) or `m:ss` (pace) in an `<input type="text">`.
   - On blur, parses the string back to seconds; if invalid, shows an inline error and calls `onChange(null)`.
2. Write unit tests for the parsing/formatting logic (Vitest).
3. Replace all raw duration/pace `<input type="number">` fields in `LogWorkoutPage.tsx` (cardio segment duration, cardio segment pace, cardio session total duration) with `<TimeInput>`.
4. Replace the duration input in the strength log form with `<TimeInput format="duration">`.

---

## Group 5 — Exercise Picker Grouped by Type ✅ DONE

1. In `ExerciseEntryBlock.tsx` and the template editor exercise selector, group the options list by `exercise.types[0].name` (alphabetical); exercises with no types go in an `"Uncategorised"` group.
2. Use `<optgroup>` elements inside the `<select>`, or replicate the grouping in a custom dropdown — keep it consistent with the existing component style.
3. Exercises with multiple types appear once per group they belong to.
4. No backend change needed — `GET /exercises` already returns `types` after Group 1.

---

## Group 6 — Template Form UX: Add Exercise at Bottom + Collapsible Exercises

1. **Add Exercise at bottom:** In the template editor form, move the "Add Exercise" button below the last exercise block. No logic change — just DOM reordering.
2. **Collapsible exercises (template editor):** Add a chevron toggle to each exercise block header. Collapsed state shows exercise name + set count summary. Expanded state is the existing full block. Default: expanded.
3. **Collapsible exercises (strength log form):** Same chevron toggle. Additionally, auto-collapse an exercise block when all its sets are marked done. If a set is un-ticked, re-expand the block.
4. Collapsed/expanded state is local React state — not persisted.

---

## Group 7 — Strength Log UX Polish

1. **Green set completion:** In the strength log form, change the completed-set CSS class from the current muted/greyed style to a green highlight (e.g. `text-green-700 line-through` / green background chip). Consistent with the blue-accent design system.
2. **Auto-fill session title:**
   - When `?templateId` is present, read the template name from the loaded template and pre-populate the `title` field.
   - Without a template, pre-populate with `"Strength session"`.
   - Pre-population fires only when the form is first mounted (do not overwrite user edits).

---

## Group 8 — Cardio Auto-fill Session Title

1. In the cardio log form, compute a default title as `"<Activity type name> – <distance> km"` (e.g. `"Run – 8 km"`).
2. Update the default live (via `useEffect` or derived state) whenever the selected activity type or total distance changes — but only if the user has not manually edited the title field yet.
3. Track "user has edited" via a `titleTouched` boolean in local state; set it `true` on the first manual `onChange` event.

---

## Group 9 — Exercise Types in Settings UI

1. In `SettingsPage.tsx`, add a third section: **Exercise Types** — CRUD list identical in layout to Activity Types.
2. In the exercise create/edit form (in Settings), add a multi-select tag input for types:
   - Renders existing exercise types as selectable chips or a multi-select dropdown.
   - Sends `type_ids` on create/patch.
3. Ensure creating or deleting an exercise type immediately reflects in the exercise picker (invalidate the `exercises` React Query cache on exercise-type mutations).
