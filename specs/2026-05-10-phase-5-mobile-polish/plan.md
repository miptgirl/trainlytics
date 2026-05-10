# Phase 5 — Implementation Plan

Each group is a shippable unit. Groups 1–6 are independent and can be done in any order. Complete Group 7 last — it is a full-app audit and should verify nothing from Groups 1–6 introduced new layout regressions.

---

## Group 1 — Remove Weight Stepper Buttons ✅

**File:** `frontend/src/components/ExerciseEntryBlock.tsx`

1. Locate the weight `<input>` (around line 362): `type="number" min="0" step="any"`.
2. Change to `type="text" inputMode="decimal"`. Remove `min` and `step` — they are not valid on text inputs.
3. Verify the placeholder and `register()` binding are unchanged.
4. Manually test on a 375 px viewport: confirm no stepper buttons appear and the decimal keyboard opens on mobile.
5. Confirm existing weight values still load and display correctly when editing a session.

---

## Group 2 — Fix Mobile Duration Keyboard ✅

**File:** `frontend/src/components/TimeInput.tsx`

1. Locate line 151: `inputMode="numeric"`.
2. Change to `inputMode="text"`.
3. Verify: on iPhone, the full text keyboard opens for all duration and pace fields across the cardio log form and the strength log form.
4. Verify: desktop behaviour is unchanged (no keyboard popup on desktop).
5. Existing `TimeInput` unit tests should still pass — no logic change.

---

## Group 3 — Compact Exercise / Segment Remove Button ✅

**Files:**
- `frontend/src/components/ExerciseEntryBlock.tsx` (exercise remove)
- `frontend/src/pages/LogWorkoutPage.tsx` (segment remove)

1. In `ExerciseEntryBlock.tsx` (around line 292–295): replace the `"Remove exercise"` text link with a small icon button. Use a ✕ SVG or the existing `✕` character at a larger clickable size. Apply `aria-label="Remove exercise"`. Keep the `canRemove` guard. Suggested classes: `p-1 text-gray-400 hover:text-red-500 rounded`.
2. In `LogWorkoutPage.tsx` (around line 382–388): apply the same icon treatment to the "Remove" button on segment cards. `aria-label="Remove segment"`.
3. Verify both remove actions still work correctly.
4. Verify the exercise header row no longer overflows on a 375 px viewport when the exercise name is long.

---

## Group 4 — Move "Add Segment" to Bottom ✅

**File:** `frontend/src/pages/LogWorkoutPage.tsx`

1. Locate the segments section (around line 363–374): a flex header row containing `<h2>Segments</h2>` and the `+ Add Segment` button side by side.
2. Remove the button from the flex row. The `<h2>` heading can stay as a standalone element or be removed if it becomes redundant — keep it for clarity.
3. Render the `+ Add Segment` button *below* the `{fields.map(...)}` list, styled consistently with the "Add Exercise" button in the template editor.
4. Verify: clicking the button appends a new segment and it appears at the bottom of the list.
5. Verify: the heading row no longer has an orphaned right-side gap.

---

## Group 5 — Green Completed-Exercise Header ✅

**File:** `frontend/src/components/ExerciseEntryBlock.tsx`

1. The `allDone` boolean is already computed at line 247.
2. In the header `<div>` (around line 267): conditionally apply green background and text when `allDone && showDone` is true. Example: add `${allDone && showDone ? 'bg-green-50' : ''}` to the header div, and `${allDone && showDone ? 'text-green-700' : 'text-gray-700'}` to the exercise name span.
3. The green state must reset if a set is un-ticked (the `allDone` computation already handles this reactively).
4. Verify: completing the last set of an exercise turns the header green and auto-collapses the block; un-ticking one set returns the header to its default style and expands the block.
5. Verify: template editor (where `showDone={false}`) is unaffected — headers never turn green there.

---

## Group 6 — Auto-Calculate Pace ✅

**File:** `frontend/src/pages/LogWorkoutPage.tsx`

This change applies to the cardio log form only.

1. Inside the cardio form section, for each segment obtain `watch` values for `segments.${index}.distance_km` and `segments.${index}.duration_seconds`.
2. Add a `useEffect` (or use `useWatch`) per segment that fires when either value changes:
   ```ts
   useEffect(() => {
     const dist = parseFloat(distanceKm)
     const dur = durationSeconds
     if (!isNaN(dist) && dist > 0 && dur != null && dur > 0) {
       setValue(`segments.${index}.pace_seconds_per_km`, Math.round(dur / dist), { shouldValidate: false })
     }
   }, [distanceKm, durationSeconds])
   ```
3. The pace field remains fully editable — no `disabled` or `readOnly` attribute. The auto-calc simply updates the field value; the user can overwrite it at any time.
4. When distance or duration is cleared / zero / invalid, do not update the pace field (leave whatever value is there).
5. Verify: entering distance 5 km and duration 25:00 (1500 s) auto-fills pace as `5:00` (300 s/km displayed by `TimeInput`).
6. Verify: manually overriding pace, then changing distance, recalculates and overwrites.
7. Verify: pace field can still be submitted with a manually typed value that differs from the auto-calc.

---

## Group 7 — Mobile Responsive Audit

This group is a testing and fix pass — no single code change. Complete Groups 1–6 first.

1. Open Chrome DevTools, set device to **iPhone SE (375 × 667)**.
2. Audit each route in turn:

   | Route | Key things to check |
   |---|---|
   | `/login` | Form fields and button fit; no overflow |
   | `/history` | Session cards, stat badges, weekly summary card, trends chart |
   | `/log` (cardio) | All segment fields, Add Segment button, Submit |
   | `/log` (strength) | Exercise blocks, set grid columns, Add Exercise button |
   | `/log?templateId=N` | Same as above; template picker modal |
   | `/sessions/cardio/:id` | All segment detail rows |
   | `/sessions/strength/:id` | All exercise/set detail rows |
   | `/templates` | Template list cards |
   | `/templates/:id/edit` | Template editor form, exercise blocks |
   | `/settings` | All three sections (Activity Types, Exercises, Exercise Types) |

3. For each overflow or clip found, fix the responsible CSS (add `min-w-0`, `overflow-hidden`, `flex-wrap`, `w-full`, etc.) and note the file and line in the PR description.
4. Re-audit at **iPhone 14 Pro (390 × 844)** to confirm fixes hold at a slightly wider width.
5. Confirm desktop layout (≥ 1024 px) is unchanged throughout.
