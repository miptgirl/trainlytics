# Phase 2 — Implementation Plan

Each group is a shippable unit. Complete them in order — later groups depend on earlier ones.

---

## Group 1 — Template Data Model & Migrations ✅ DONE

1. Add `StrengthTemplate` model: `id`, `user_id`, `name`, `notes`, `created_at`, `updated_at`
2. Add `StrengthTemplateExercise` model: `id`, `template_id`, `exercise_id`, `order`
3. Add `StrengthTemplateSet` model: `id`, `exercise_entry_id`, `set_number`, `reps`, `weight_kg`, `notes`
4. Write Alembic migration for the three new tables (FK constraints: `template_id → strength_templates.id CASCADE DELETE`, `exercise_id → exercises.id RESTRICT`, `exercise_entry_id → strength_template_exercises.id CASCADE DELETE`)
5. Add SQLAlchemy relationships: `StrengthTemplate.exercises` → `StrengthTemplateExercise.sets`

---

## Group 2 — Template CRUD API

1. `POST /templates/strength` — create a template with nested exercises and sets in one transaction
2. `GET /templates/strength` — list all templates for the current user (name + exercise count)
3. `GET /templates/strength/{id}` — full template detail with nested exercises and sets
4. `PATCH /templates/strength/{id}` — replace exercises/sets in full (same pattern as session PATCH); update `updated_at`
5. `DELETE /templates/strength/{id}` — delete template; exercise library entries are unaffected (RESTRICT on exercises FK — only the template entry is removed, not the exercise)
6. Pydantic schemas: `StrengthTemplateCreate`, `StrengthTemplateUpdate`, `StrengthTemplateRead` (nested)
7. Tests: CRUD lifecycle, user isolation (user A cannot read/edit/delete user B's templates), cascade delete

---

## Group 3 — Template Library UI

1. Add **Templates** entry to the main nav
2. Template Library page: list all templates, each row shows name + exercise count
3. "New Template" button → opens create form (same exercise/set builder as Log Strength, reused component)
4. Edit template: pre-fill form with existing data, submit calls `PATCH`
5. Delete template: confirmation dialog, then `DELETE`
6. "Use this template" button per row → navigates to Log Strength with template pre-filled

---

## Group 4 — Log from Template (Pre-fill)

1. Add a "Start from template" dropdown at the top of the Log Strength page; fetches `GET /templates/strength`
2. On selection, populate all exercise and set fields from the template (fully editable)
3. Track the source `template_id` in component state (needed for change detection in Group 5)
4. "Use this template" button from the Template Library navigates to Log Strength with a `?templateId=` query param; page auto-selects and pre-fills on mount
5. Selecting a different template or clearing the selector resets the form

---

## Group 5 — Change Detection & Template Update Prompt

1. On Log Strength form submit, if a `template_id` is in state, run a client-side diff against the original template snapshot:
   - Exercises added / removed / reordered
   - Number of sets per exercise changed
   - Reps, weight, or notes changed on any set
2. If no diff → submit session normally, no prompt
3. If diff detected → show a **diff summary modal** listing each change in plain language
4. Modal actions: **"Yes, update template"** (PATCH template then submit session) · **"No, keep template as-is"** (submit session only) · **"Cancel"** (close modal, stay on form)
5. Template PATCH on "Yes" replaces template content with the submitted session's exercise/set structure
