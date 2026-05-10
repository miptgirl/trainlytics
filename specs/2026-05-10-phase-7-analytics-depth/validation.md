# Phase 7 — Analytics Depth: Validation

## Definition of Done (from roadmap)

> A user can open the main screen, switch to the pace chart tab, and see how their running pace has changed over recent weeks broken down by activity type. They can also log their daily steps and see them alongside training volume on the 12-week chart.

---

## Acceptance Criteria

### Pace Trends Chart

- [x] A "Pace" tab is visible on the History screen alongside the existing "Trends" chart tab
- [x] Switching to the Pace tab renders a line chart with weekly buckets on the x-axis (same 12-week window as training trends)
- [x] Each distinct (activity type, segment label) pair is a separate line with a distinct colour
- [x] Segment labels show the segment `title` when one exists, or "Segment N" (positional) otherwise
- [x] The activity-type filter control correctly shows/hides the corresponding lines
- [x] Pace values are displayed in min/km format (not raw sec/km)
- [x] Weeks with no qualifying cardio data produce a gap in the line (not zero)
- [x] An empty state message is shown when no cardio sessions with distance/duration exist
- [x] `GET /sessions/pace-trends` returns correct weekly averages for multi-type, multi-segment test data

### Step Tracking

- [x] `/steps` route is accessible from the Settings tab — moved: Steps is now accessible from Log Workout picker and the standalone `/steps` page
- [x] A user can submit a step count for any date; re-submitting the same date updates the existing record
- [x] The step list on `/steps` shows recent entries in reverse-chronological order
- [x] Tapping an entry pre-fills the form with that date and count for editing
- [x] `DELETE /steps/{id}` removes the entry for the authenticated user (404 for not-found or wrong user)
- [x] A "Delete" button on each row calls `DELETE /steps/{id}` with a confirmation prompt; after delete the form resets to "new entry" mode
- [x] `POST /steps` and `GET /steps` endpoints respond correctly and are protected by auth
 - [x] `POST /steps` and `GET /steps` endpoints respond correctly and are protected by auth
 - [x] The 12-week training trends chart displays a step count line on a secondary right-side y-axis
 - [x] Weeks with no step data show a gap in the step line (not zero)
 - [x] The step line is visually distinct from the cardio/strength area fills

Notes: frontend `/steps` screen and hooks implemented. Manual verification performed locally:
- Navigated to Settings → Steps, opened the `/steps` page
- Created and edited entries; POST /steps was called and list refreshed via React Query

Remaining work: ensure manual QA checklist items are signed off and frontend TypeScript/build checks pass in CI.

---

## Manual QA Checklist

- [ ] Log several cardio sessions across different weeks and activity types, then confirm the pace chart reflects the correct weekly averages
- [ ] Verify segment breakdown: a session with two segments shows two separate lines for the same activity type
- [ ] Enter step counts for several days across the last two weeks; confirm they appear on the 12-week chart in the correct week buckets
- [ ] Submit steps for a date already entered; confirm the count is updated, not duplicated
- [ ] Confirm all existing History, Templates, and Log screens are unaffected (no regressions)
- [ ] Test on a mobile viewport: tabs, chart tooltip touch interaction, and step entry form are usable

---

## API Contract

### `GET /sessions/pace-trends`

Query params: `weeks` (default 13, covering 12 complete weeks + current in-progress week)

Response (array):
```json
[
  {
    "week_start": "2026-04-28",
    "activity_type": "Run",
    "segment_label": "Segment 1",
    "avg_pace_sec_per_km": 312
  }
]
```

### `POST /steps`

Body:
```json
{ "date": "2026-05-10", "steps": 9500 }
```

Response: the upserted entry.

### `GET /steps`

Query params: `start_date`, `end_date` (ISO date strings)

Response (array of step entries ordered by date descending).

---

## Merge Criteria

The branch is ready to merge when:

1. All acceptance criteria above are checked
2. Manual QA checklist is fully signed off
3. Backend pytest suite passes with no new failures
4. Frontend TypeScript compiles with no errors
5. No horizontal scroll or layout breakage on a 390 px (iPhone 14) viewport
