# Phase 6 — Export & Draft Recovery: Validation

## Definition of Done

A user can tap "Copy" on any logged session from the history list or detail page and paste a clean markdown summary into ChatGPT or a coach chat. If they close the log form mid-session by accident, they are offered to restore their work the next time they open it.

---

## Export

### Functional

- [ ] "Copy" button is visible on each row in the History list
- [x] "Copy" button is visible on `StrengthSessionDetailPage`
- [x] "Copy" button is visible on `CardioSessionDetailPage`
- [ ] Copying a strength session produces a markdown summary with: H2 header (title + date), all exercises as H3 headers, all sets as bullet lines (`N kg × R reps`), optional notes at the bottom
- [ ] Copying a cardio session produces a markdown summary with: H2 header (title/type + date), all segments as H3 headers with distance/duration/pace, optional notes at the bottom
- [ ] Optional fields (calories, notes, segment title) are omitted from the output when null or empty — no blank lines left behind
- [x] Button shows "Copied!" for ~2 s then resets to the copy icon
- [ ] Clicking Copy on a history list row triggers a network request to the detail endpoint (confirmed in DevTools Network tab) — then copies without opening the detail page
- [x] Clicking Copy on the detail page does NOT trigger an extra network request

### Edge cases

- [ ] Session with no notes: notes line absent from output
- [ ] Strength set with null weight: renders `— kg × N reps`
- [ ] Cardio segment with no title: header falls back to `Segment N`
- [x] Clipboard denied (e.g. permissions): a visible error message is shown instead of silent failure

### Unit tests

- [x] `formatStrengthSession` tests pass (exercises, sets, nulls)
- [x] `formatCardioSession` tests pass (segments, named/unnamed, nulls)

---

## Draft Auto-Save

### Functional

- [ ] Filling in any field in the strength form and refreshing the page shows a restore banner: *"You have an unsaved Strength draft."*
- [ ] Clicking Restore on the strength banner re-populates all fields correctly (exercises, sets, reps, weights, title, date, notes)
- [ ] Filling in any field in the cardio form and refreshing shows a restore banner for the cardio form
- [ ] Clicking Restore on the cardio banner re-populates all fields correctly (segments, distances, durations)

### Template association

- [ ] Starting a strength session from template X, filling some fields, refreshing, and restoring — the restored session still links to template X (templateId is preserved)
- [ ] Submitting the restored session triggers the "differs from template?" prompt correctly

### Discard & clear

- [ ] Clicking Discard hides the banner and clears the draft from `localStorage` (confirmed in DevTools Application tab)
- [ ] Refreshing after discard shows no restore banner
- [ ] Submitting a strength session successfully clears the strength draft from `localStorage`
- [ ] Submitting a cardio session successfully clears the cardio draft from `localStorage`

### Tab independence

- [ ] Switching from Strength tab to Cardio tab does not clear the Strength draft
- [ ] Switching back to Strength tab still shows the restore banner for the Strength draft
- [ ] Starting and saving a cardio draft, then switching to Strength (with no strength draft) shows no strength restore banner

### No draft state

- [ ] Opening the log form with no draft in `localStorage` shows no restore banner
