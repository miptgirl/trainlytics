# Phase 5 — Mobile Polish & Logging UX Requirements

## Scope

Seven focused UX improvements driven directly by user feedback. All changes are frontend-only — no database migrations, no new API endpoints. The goal is to make daily logging on an iPhone accident-free and require less mental calculation.

---

## Decisions

### 1. Remove Weight Increment/Decrement Buttons

- The weight field in `ExerciseEntryBlock.tsx` uses `type="number"`, which renders native browser stepper buttons. On mobile, these caused accidental weight changes (a tap-and-scroll gesture would silently increment or decrement the value).
- Fix: change the weight `<input>` from `type="number"` to `type="text"` with `inputMode="decimal"`. The reps field stays as `type="number"` — it was not reported as problematic.
- No backend change. Weights are still stored as numeric strings; the existing `register()` binding and parse logic is unchanged.

### 2. Fix Mobile Duration Keyboard

- `TimeInput.tsx` currently sets `inputMode="numeric"`, which opens a number pad on iPhone. The `h:mm:ss` format requires a colon, which is not available on the numeric keyboard.
- Fix: change `inputMode` from `"numeric"` to `"text"`. This opens the full keyboard on mobile, allowing the colon to be typed.
- All `TimeInput` uses (cardio segment duration, cardio session total, strength session duration, cardio segment pace) are fixed by this single change.

### 3. Compact Exercise Remove Button

- In `ExerciseEntryBlock.tsx`, the "Remove exercise" control is a text link (`text-xs`). On narrow screens it clashes with the exercise name in the header row.
- Fix: replace with a small icon button (✕ or trash SVG, ≤ 20 px). The button must remain accessible with an `aria-label`.
- The "Remove" text button on cardio segments in `LogWorkoutPage.tsx` (line 385) gets the same treatment for visual consistency.

### 4. Move "Add Segment" to Bottom

- The "Add Segment" button currently sits in a flex header row alongside the "Segments" heading, at the top of the segment list. This is inconsistent with "Add Exercise" in the template editor, which appears below the last item.
- Fix: remove the button from the flex header and render it below the last segment card. The "Segments" heading remains as a standalone label.
- No logic change — only DOM reordering.

### 5. Green Completed-Exercise Header

- When all sets within an exercise are marked done, the exercise block auto-collapses (existing behaviour). The header should also turn green — matching the per-set green treatment — to make it visually obvious at a glance that the exercise is complete.
- The `allDone` boolean is already computed in `ExerciseEntryBlock.tsx` (line 247). The fix is to apply a green background/text class to the header `<div>` when `allDone` is true.
- Only applies in the strength log form (`showDone={true}`), not in the template editor.

### 6. Auto-Calculate Pace

- In the cardio segment form, users currently must calculate and enter pace manually after entering distance and duration.
- Fix: whenever `distance_km` or `duration_seconds` changes in a segment, compute `pace_seconds_per_km = duration_seconds / distance_km` and write it back to the form field via `setValue`.
- Recalculation always overwrites the pace field — if the user manually typed a pace and then edits distance or duration, the pace is recalculated. There is no "lock" state.
- The pace field remains editable at any time. A manual override simply sits there until the next distance/duration change triggers a new calculation.
- Implementation: use `useWatch` on the relevant segment fields and a `useEffect` per segment, or use `watch` + `setValue` from React Hook Form. Pace is only written when both distance (> 0) and duration (> 0) are present; otherwise the field is left unchanged.
- No backend change.

### 7. Mobile Responsive Audit

- A full pass across **all routes** on 375 px wide viewports to eliminate horizontal scroll and clipped controls.
- Routes in scope: `/login`, `/history`, `/log` (cardio + strength), `/sessions/cardio/:id`, `/sessions/strength/:id`, `/templates`, `/settings`.
- Audit method: Chrome DevTools device emulation at 375 × 812 (iPhone SE / 13 mini) in portrait, then 390 × 844 (iPhone 14).
- Acceptance criteria: zero horizontal scroll anywhere, no controls clipped by viewport edge, all interactive elements reachable by thumb.

---

## Out of Scope for Phase 5

- Unit preference (kg / lb) — still deferred.
- Template versioning — still deferred.
- Any new analytics, charts, or backend endpoints.
- Pace auto-calculation for the session-level total duration/distance (segments only).
