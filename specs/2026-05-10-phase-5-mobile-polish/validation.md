# Phase 5 — Validation

The implementation is complete and mergeable when all of the following pass.

---

## Group 1 — Weight Input ✅

- [x] The weight field in the strength log form renders as a plain text input with no stepper buttons on any browser
- [x] On iPhone (tested in Safari or Chrome mobile), tapping the weight field opens the decimal keyboard (not the integer number pad)
- [x] Entering a decimal weight (e.g. `67.5`) works correctly and submits the expected value to the API
- [x] Existing sessions with saved weights load and display correctly in the weight field when editing

---

## Group 2 — Duration Keyboard ✅

- [x] On iPhone, tapping any duration or pace field (cardio segment, cardio total, strength session) opens the full text keyboard (not a number pad)
- [x] The colon character is reachable on the first keyboard pane without switching layout
- [x] Entering `1:05:30` in a duration field still submits `3930` seconds (parsing logic unchanged)
- [x] Entering `5:30` in a pace field still submits `330` seconds-per-km
- [x] All existing `TimeInput` unit tests pass

---

## Group 3 — Compact Remove Buttons ✅

- [x] The "Remove exercise" control in the exercise header is a small icon button (no text label visible on screen)
- [x] The button has `aria-label="Remove exercise"` (verify in DevTools Accessibility pane)
- [x] The exercise header row does not overflow horizontally on a 375 px viewport, even with a long exercise name
- [x] The segment remove control is also a small icon button with `aria-label="Remove segment"`
- [x] Both remove actions still delete the correct item

---

## Group 4 — Add Segment Position ✅

- [x] The `+ Add Segment` button appears **below** the last segment card, not in a header row at the top
- [x] The "Segments" heading is still visible (either standalone or retained in the header row without the button)
- [x] Clicking the button appends a new blank segment at the bottom of the list
- [x] The button is fully visible and not clipped on a 375 px viewport

---

## Group 5 — Green Exercise Header ✅

- [x] When all sets in an exercise are marked done, the exercise header turns green (background and/or text)
- [x] The green treatment matches the per-set green style (`bg-green-50`, `text-green-700`)
- [x] Un-ticking any set returns the header to its default (non-green) style
- [x] The template editor exercise headers are never green (the feature is gated on `showDone`)
- [x] The auto-collapse behaviour is unchanged (block collapses when all sets done, re-expands when a set is un-ticked)

---

## Group 6 — Auto-Calculate Pace ✅

- [x] Entering distance `5` km and duration `25:00` in a segment auto-fills pace as `5:00` (300 s/km)
- [x] Entering distance `10` km and duration `50:00` auto-fills pace as `5:00` (300 s/km)
- [x] Changing distance after pace is auto-filled recalculates pace immediately
- [x] Changing duration after pace is auto-filled recalculates pace immediately
- [x] Manually overriding the pace field, then changing distance, results in pace being recalculated and overwritten
- [x] When distance is empty or zero, pace is not modified
- [x] When duration is empty or zero, pace is not modified
- [x] The pace field is still editable at any time (not disabled or read-only)
- [x] A session with manually overridden pace submits the overridden value if no subsequent distance/duration change occurred

---

## Group 7 — Mobile Responsive Audit

Test viewport: **375 × 667 (iPhone SE)** in Chrome DevTools device emulation.

- [ ] `/login` — no horizontal scroll; form and button fit within viewport
- [ ] `/history` — session cards, stat badges, weekly summary, and trends chart render without overflow
- [ ] `/log` (cardio) — all segment fields, Add Segment button, and Submit button are fully visible; no controls clipped
- [ ] `/log` (strength) — exercise block set-grid columns fit; Add Exercise button visible below last exercise
- [ ] `/log?templateId=N` — template picker modal fits within viewport; exercise blocks usable
- [ ] `/sessions/cardio/:id` — segment rows render without horizontal scroll
- [ ] `/sessions/strength/:id` — exercise and set rows render without horizontal scroll
- [ ] `/templates` — template list cards fit; no overflow
- [ ] `/templates/:id/edit` — template editor form and exercise blocks fit on 375 px
- [ ] `/settings` — all three sections (Activity Types, Exercises, Exercise Types) render without overflow
- [ ] Desktop layout (≥ 1024 px) is unchanged for all routes above
