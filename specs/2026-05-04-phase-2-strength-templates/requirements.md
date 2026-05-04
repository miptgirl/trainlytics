# Phase 2 — Strength Templates Requirements

## Scope

Allow users to create reusable strength session templates and log against them. Templates pre-fill the strength logging form and a change-detection step lets users optionally save back any modifications.

---

## Decisions

### Template Data Model
- A `StrengthTemplate` belongs to a user and has: `name`, `notes`, `created_at`, `updated_at`.
- A template contains one or more `StrengthTemplateExercise` rows: `template_id`, `exercise_id`, `order`.
- Each exercise entry contains one or more `StrengthTemplateSet` rows: `exercise_entry_id`, `set_number`, `reps`, `weight_kg`, `notes`.
- This mirrors the existing `StrengthSession` → `StrengthExerciseEntry` → `StrengthSet` shape intentionally — the same exercise can appear more than once in a single template (e.g. warm-up sets vs. working sets as separate entries).

### Template Library
- Dedicated screen accessible from the main nav.
- Lists all user templates; each row shows the template name and a count of exercises.
- Actions per template: **Edit**, **Delete**, **Use** (starts a new strength session pre-filled from this template).

### Log from Template
- The user can start a strength session from a template from two entry points:
  1. **Log Strength page** — a "Start from template" selector at the top; selecting one pre-fills the form.
  2. **Template Library** — a "Use this template" button on each template.
- Pre-filled forms are fully editable before submitting.

### Set Completion Tracking
- When the Log Strength form is pre-filled from a template, each set row displays a **"Done"** toggle (e.g. a checkbox or tick button).
- Marking a set as done visually distinguishes it from pending sets (e.g. strikethrough, muted colour, or a filled tick icon) so the user can see at a glance what has been completed during the session.
- The done state is **UI-only** — it is not stored in the backend and is not submitted as part of the session payload.
- Sets are not marked done by default when the template is loaded; the user marks each one manually as they complete it.
- The toggle is only shown when a template is active; free-form (no-template) logging does not show done toggles.

### Change Detection on Commit
- On form submit, if the session was started from a template, compare the submitted data against the template.
- **What counts as a change:**
  - An exercise was added or removed.
  - The same exercise appears a different number of times (order changed counts as structural change).
  - Number of sets for any exercise entry changed.
  - Reps or weight changed on any set.
  - Notes changed on any set.
- If any change is detected, show a **diff summary** (e.g. "Added 1 set to Squat · Removed Romanian Deadlift · Changed weight on Bench Press set 2") and ask: *"Update template with these changes?"* — yes/no.
- If the user confirms, the template is updated to match what was actually logged.

### Units
- All weights are stored and displayed in **kg** for Phase 2.
- Unit preference (kg/lb) is deferred to a future phase but should be designed with that extension in mind — weight fields should carry no implicit unit assumption in the API.

> **Backlog:** Template versioning (history of past template states) — deferred beyond Phase 2.
> **Backlog:** User unit preference (kg vs lb) — deferred beyond Phase 2.

---

## Out of Scope for Phase 2

- Cardio templates (no equivalent concept currently planned)
- Template sharing between users
- Applying a template to a *past* session (edit flow only touches session data, not template)
- Planning / scheduling templates to days (Phase 4)
