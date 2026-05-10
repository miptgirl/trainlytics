# Phase 6 — Export & Draft Recovery: Requirements

## Goal

A user can share any session as structured markdown for AI or coach analysis, and never lose a half-filled log form.

---

## Feature 1: Training Summary Export

### Scope

- A "Copy" icon button appears on each session row in the History list and on both the Strength and Cardio detail pages.
- Clicking it copies a markdown-formatted session summary to the clipboard and gives brief visual feedback ("Copied!" for ~2 s, then resets).
- No new backend endpoints — the detail pages already have full data; the history list fetches the full session on demand via the existing detail API before copying.

### Markdown format

**Strength example:**
```
## Push Day – 2026-05-10 14:30
Type: Strength | Duration: 60 min | Calories: 450 kcal

### Bench Press
- Set 1: 80 kg × 8
- Set 2: 82.5 kg × 6

Notes: Felt strong today.
```

**Cardio example:**
```
## Run – 2026-05-10 07:00
Type: Run | Duration: 45 min | Distance: 8.00 km | Calories: 350 kcal

### Segment 1: Warm-up walk
- Distance: 1.00 km | Duration: 10:00 | Pace: 10:00 min/km

### Segment 2: Main run
- Distance: 7.00 km | Duration: 35:00 | Pace: 5:00 min/km

Notes: Good conditions.
```

Rules:
- Title is used as the H2 heading if present; otherwise falls back to session type.
- Calories and Notes lines are omitted if null/empty.
- Segment title used as the H3 label if present; otherwise `Segment N`.
- All weights in kg, distances in km, paces in `m:ss min/km`, durations in `h:mm` or `m:ss` as appropriate.
- Sets with null reps or weight are rendered as `—` for that field.

### Key decisions

- **No new backend endpoints.** Export is entirely frontend.
- **History list fetch on demand.** The `SessionSummary` returned by the list API omits exercises and segments. When a user clicks Copy on a list row, the frontend fetches the full session (`GET /sessions/strength/{id}` or `GET /sessions/cardio/{id}`) before formatting.
- **Detail page copies from already-fetched data.** No extra network request.
- **Clipboard API.** Use `navigator.clipboard.writeText`. Show a fallback message if the browser denies clipboard access (rare on modern mobile browsers, but worth handling gracefully).

---

## Feature 2: Draft Auto-Save

### Scope

- The unified `/log` form saves its in-progress state to `localStorage` as the user types.
- When the form is opened with an existing draft, a non-blocking restore banner is shown.
- Drafts are cleared automatically on successful submission.

### localStorage keys

| Key | Content |
|---|---|
| `trainlytics_draft_strength` | Strength form state + `templateId` |
| `trainlytics_draft_cardio` | Cardio form state |

### Behaviour

- **Save:** On every form field change, write the current form state to the relevant key. Both strength and cardio are independent — switching between them does not clear the other draft.
- **Restore prompt:** On form mount, if a draft exists for the active type, show a dismissible banner at the top of the form: *"You have an unsaved [Strength/Cardio] draft. [Restore] [Discard]"*
  - **Restore:** Populates all fields from the draft including template association (templateId). The template-diff check on submit will still fire correctly.
  - **Discard:** Clears the draft from `localStorage` and hides the banner.
- **Clear on submit:** On successful API response, clear the draft for that session type.
- **Switching type:** Switching the Cardio/Strength tab on the log form does not affect the draft of the other type. Each type's draft is loaded independently when that tab becomes active.

### Key decisions

- **templateId in strength draft.** The draft stores the `templateId` (if any) alongside form values so the template-diff logic on submit can re-evaluate correctly after restore.
- **No debouncing required.** Form state is small; write on every change is fine.
- **Draft format is internal.** The shape of the stored JSON mirrors React Hook Form's `getValues()` output plus a `templateId` field — no versioning needed for now.
