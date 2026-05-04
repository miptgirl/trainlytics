# Phase 2 — Validation

The implementation is complete and mergeable when all of the following pass.

---

## Template CRUD

- [x] Can create a template with a name, multiple exercises, and multiple sets per exercise — *verified by `test_create_strength_template`*
- [x] Created template appears in the list immediately with correct exercise count — *React Query invalidates `['templates', 'strength']` on create*
- [x] Can retrieve full template detail with nested exercises and sets — *verified by `test_get_strength_template`*
- [x] Can edit a template (change name, add/remove exercises, change sets/reps/weight) — *verified by `test_patch_strength_template`*
- [x] Can delete a template; the exercises in the user's library are unaffected — *verified by `test_delete_strength_template`*
- [x] User A cannot read, edit, or delete User B's templates — *verified by `test_template_user_isolation`*

---

## Template Library UI

- [x] Templates nav link is visible and navigates to the Template Library page
- [x] Library lists all user templates; each row shows name and exercise count
- [x] "New Template" opens a form; submitting creates the template and shows it in the list
- [x] Edit template pre-fills all fields; saving updates the template in the list
- [x] Delete template shows a confirmation dialog; confirming removes it from the list
- [x] "Use this template" button navigates to the Log Strength page with the template pre-filled

---

## Log from Template

- [x] Log Strength page shows a "Start from template" dropdown listing all user templates
- [x] Selecting a template pre-fills all exercises, sets, reps, and weights in the form
- [x] Pre-filled fields are fully editable before submitting
- [x] Navigating to Log Strength with `?templateId=<id>` auto-selects and pre-fills the template on mount
- [x] Clearing the template selector resets the form to empty

---

## Change Detection & Template Update

- [x] Submitting a session that matches the template exactly does **not** show the diff prompt
- [x] Adding an exercise triggers the diff prompt and the summary mentions the added exercise
- [x] Removing an exercise triggers the diff prompt and the summary mentions the removed exercise
- [x] Changing the number of sets on any exercise triggers the diff prompt
- [x] Changing reps or weight on any set triggers the diff prompt
- [x] Choosing **"Yes, update template"** — the template is updated to match the session, and the session is saved
- [x] Choosing **"No, keep template as-is"** — the session is saved and the template is unchanged
- [x] Choosing **"Cancel"** — neither the session nor the template is modified; user stays on the form

---

## Set Completion Tracking

- [x] When a template is active, each set row displays a "Done" toggle (✓ tick button)
- [x] Marking a set as done applies a visual treatment (muted opacity) to distinguish it from pending sets
- [x] Sets are not marked done by default when the template is loaded
- [x] The done toggle is only visible when a template is active (`showDone={templateSnapshot !== null}`)
- [x] Free-form (no-template) logging does not show done toggles
- [x] The `done` field is stripped before the session POST payload — it is never sent to the backend
- [x] Clearing or swapping the template resets all `done` flags (form reset via `emptyDefaults()` / `templateToFormValues`)

---

## Regression

- [x] Logging a strength session **without** a template still works exactly as before
- [x] All Phase 1 backend tests pass (`pytest backend/tests/`)
- [x] Existing history and session detail views are unaffected
