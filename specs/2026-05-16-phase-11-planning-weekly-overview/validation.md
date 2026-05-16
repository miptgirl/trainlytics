# Phase 11 — Planning & Weekly Overview: Validation

## Definition of Done

A user can open the Plan tab, build a week's plan with strength and cardio sessions, navigate prev/next weeks, and see planned sessions flip to Done when a matching session is logged — or to Skipped when a day passes with no log. They can annotate skipped sessions with a reason, copy last week's plan in one tap, and — when logging a cardio session that matches today's plan — tap "Adapt this session" to get AI-powered modification suggestions.

---

## Status

| Group | Status |
|---|---|
| Group 1 — Backend: Data Model & Migrations | ✅ Complete |
| Group 2 — Backend: Plan CRUD Endpoints | ✅ Complete |
| Group 3 — Backend: Pydantic Schemas | ✅ Complete |
| Group 4 — Backend: AI Cardio Adapt Endpoint | ✅ Complete |
| Group 5 — Backend: Tests | ✅ Complete |
| Group 6 — Frontend: /plan Route, Nav & API Hooks | ✅ Complete |
| Group 7 — Frontend: Week Grid & Session Display | ✅ Complete |
| Group 8 — Frontend: Plan Session Form | ⬜ Pending |
| Group 9 — Frontend: Start Session from Plan | ⬜ Pending |
| Group 10 — Frontend: Weekly Overview Card & Copy from Last Week | ⬜ Pending |
| Group 11 — Frontend: AI Cardio Adapt Modal | ⬜ Pending |
| Group 12 — Final QA & Polish | ⬜ Pending |

---

## Automated Tests

All tests live in `tests/test_plans.py` and `tests/test_ai_cardio_adapt.py` (see `plan.md` Group 5).

Run with:
```bash
docker compose exec backend uv run pytest tests/test_plans.py tests/test_ai_cardio_adapt.py -v
```

### Minimum passing coverage

| Scenario | Expected |
|---|---|
| `GET /plans/{week_start}` with non-Monday date | 400 |
| `GET /plans/{week_start}` with no existing plan | Empty plan auto-created, 200 |
| Planned strength session + matching logged session → | `status: done`, `matched_session_id` set |
| Planned session, day elapsed, no log → | `status: skipped` |
| Planned session, day not yet passed, no log → | `status: planned` |
| Planned cardio matched by primary activity type → | `status: done` |
| `POST` with missing `template_id` for strength → | 422 |
| `POST` cardio with empty segments → | 422 |
| `PATCH` skip-note sets and clears note | 200 both ways |
| `POST copy-from-last-week` on empty week | Sessions cloned, skip_notes cleared |
| `POST copy-from-last-week` on non-empty week | 409 |
| `POST /ai/adapt-cardio-session` with unknown `planned_session_id` | 404 |

---

## Manual Validation (after local deployment)

Start the app locally:
```bash
docker compose up --build
docker compose exec backend uv run alembic upgrade head
```
Open [http://localhost:5173](http://localhost:5173) and log in.

---

### MV-1 — Plan tab visible and navigable

1. Open the app.
2. Confirm "Plan" appears in the nav bar between History and Analytics.
3. Click "Plan" → `/plan` route loads.
4. Confirm current week (Mon–Sun) is shown with the correct date range in the header.
5. Click "←" → previous week shown, dates correct.
6. Click "→" → current week restored.

---

### MV-2 — Add a strength planned session

1. On the Plan tab for the current week, click "Add session" under today's date.
2. Select **Strength**, pick a template (e.g. "Push Day").
3. Confirm `title` auto-fills with the template name.
4. Submit.
5. Confirm a session card appears for today showing "Push Day · Strength · Planned".

---

### MV-3 — Add a cardio planned session

1. Click "Add session" under a future day (e.g. tomorrow).
2. Select **Cardio**.
3. Add two segments: Segment 1 — Run, 8 km, 50:00 min (pace should auto-calculate to ~6:15 min/km); Segment 2 — Walk, 1 km, 12:00 min.
4. Submit.
5. Confirm session card shows the day and "Run 8 km · Walk 1 km" summary.

---

### MV-4 — Auto-match: strength session → Done

1. Ensure a planned strength session exists for today (from MV-2).
2. Go to Log, log a strength session using the same template as the planned one.
3. Submit the logged session.
4. Return to the Plan tab.
5. Confirm the planned session card now shows **Done** status and links to the logged session detail.

---

### MV-5 — Auto-match: cardio session → Done

1. Plan a cardio session (Run segments) for today.
2. Log a cardio session today that includes at least one Run segment.
3. Return to the Plan tab.
4. Confirm the planned cardio card shows **Done**.

---

### MV-6 — Skipped detection

1. Navigate to a past week (use "←") with at least one planned session that has no matching log.
2. Confirm the session card shows **Skipped**.
3. Confirm sessions with a matching log on that past week still show **Done**.

---

### MV-7 — Skip note

1. Find a planned session with **Skipped** status.
2. Click "Add note" (or the prompt text on the card).
3. Type a reason (e.g. "knee pain") and save.
4. Confirm the skip note text appears on the card.
5. Click the note again, clear it, save.
6. Confirm the note is gone.

---

### MV-8 — Weekly overview card

1. On a week with a mix of Done, Skipped, and Planned sessions, check the overview card at the top.
2. Confirm counts match what is visible in the grid.
3. Confirm completion % = Done / (Done + Skipped) × 100 (Planned sessions do not count against completion).

---

### MV-9 — Copy from last week

1. Navigate to next week (currently empty).
2. Confirm "Copy from last week" button is visible.
3. Click it.
4. Confirm all sessions from the previous week are cloned with dates shifted +7 days.
5. Confirm skip notes are **not** copied (all cloned sessions start fresh).
6. Confirm the "Copy from last week" button disappears now that the week has sessions.
7. Navigate away and back — confirm the copied sessions persist.

---

### MV-10 — Copy from last week conflict

1. Manually add a session to next week.
2. Navigate to next week, observe "Copy from last week" button is gone (week is non-empty).
3. *(If testing via API directly)* `POST /plans/{next_monday}/copy-from-last-week` → confirm 409 response.

---

### MV-11 — Start from plan (strength)

1. Add a planned strength session (e.g. Push Day template) for today.
2. Click the **Start** button on the card.
3. Confirm the log form opens at `/log?type=strength&templateId=...` with Push Day pre-selected.
4. Log the session normally and submit.
5. Return to the Plan tab — confirm the card now shows **Done**.

---

### MV-12 — Start from plan (cardio)

1. Plan a cardio session for today: Segment 1 — Run 8 km 50:00; Segment 2 — Walk 1 km 12:00.
2. Click **Start** on the card.
3. Confirm the cardio log form opens with both segments pre-filled (activity types, distances, durations, paces).
4. Confirm fields are editable (change a distance, verify it accepts input).
5. *(If a localStorage draft exists)* Confirm a three-way prompt appears: restore draft / use planned session / start fresh.
6. Submit the session — confirm the Plan card flips to **Done**.

---

### MV-13 — Reschedule a planned session

1. Add a planned session for Wednesday.
2. Click **Reschedule** on Wednesday's card.
3. Confirm the modal shows Mon–Sun date options; days before today are disabled.
4. Select Friday.
5. Confirm the card moves from Wednesday to Friday in the grid; Wednesday is now empty.

---

### MV-14 — Reschedule a skipped session

1. Navigate to a past week with a skipped session.
2. Click **Reschedule** on the skipped card.
3. Confirm the modal only offers days that have not yet passed (or this should be current week only — confirm in code).
4. Select a future date — card moves to the new date and status resets to Planned.

---

### MV-15 — Swap a skipped session

1. Find a skipped session (e.g. a Run cardio session).
2. Click **Swap** → the plan session form opens pre-filled with the existing session content.
3. Change the activity type of the first segment to Cycle, adjust distance.
4. Save — card updates to show the new content; status remains Skipped (no log yet).

---

### MV-16 — Edit and delete planned sessions

1. On a Planned session card, click the edit (pencil) icon.
2. Change the notes or title.
3. Save — confirm card updates with new content.
4. Click the delete (trash) icon → confirm an inline confirmation prompt appears.
5. Confirm deletion — card disappears from the grid.

---

### MV-17 — Cardio AI adapt

> Requires a valid AI API key configured in Profile.

1. Plan a Run cardio session for today.
2. Open the Log form and start logging a cardio session; set the first segment to Run.
3. Confirm "Adapt this session" button appears near the notes field.
4. Click it → modal opens.
5. Type a complaint: "My right knee is sore today."
6. Submit → spinner appears, then AI suggestions render as markdown.
7. Confirm the suggestions reference reducing distance, swapping to walking, or similar modifications consistent with the planned run structure.
8. Close the modal → log form is still intact.

---

### MV-18 — Mobile responsiveness

1. Open the app in a mobile browser (or use browser DevTools at iPhone SE viewport: 375 × 667).
2. Confirm the nav bar does not overflow with the new "Plan" tab.
3. Confirm the Plan page scrolls vertically without horizontal overflow.
4. Confirm session cards are readable and action buttons are tappable.
5. Confirm the plan session form modal scrolls when the segment list is long.

---

## Regression Checks

Confirm the following existing features are unaffected:

| Feature | Check |
|---|---|
| History screen | Weekly summary card and training trends chart render correctly |
| Analytics tab | All charts load; nav tab order is stable |
| Log (strength) | "Adapt this session" (strength) still works |
| Log (cardio) | Pace auto-calculation and draft recovery still work |
| Templates | Create, edit, delete still works |
| Profile | AI keys and debug log still accessible |
