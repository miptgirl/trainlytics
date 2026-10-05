# Phase 17 — Validation

A group is complete when its checklist passes on a 390px viewport (and 1280px where noted) with the demo dataset, and `pnpm test`, `pnpm lint` and `pnpm build` pass.

---

## Group 1 — Mobile fundamentals + semantic tokens

- [x] Focusing any input, select or textarea at 390px doesn't zoom the page (computed font-size ≥ 16px); at 1280px fields keep their previous size
- [x] Opening the Log form from a scrolled Plan page lands at the top; browser Back restores the previous position
- [x] Every control listed in requirements 1.3 measures ≥ 44×44px at 390px
- [x] At 390px each strength set spans two lines with Delete on the second line, away from Done; done sets are tinted, not struck through; "+ Add set" sits below the last set; at ≥ 640px the single-row layout is unchanged
- [x] Save/Cancel stay visible while scrolling both Log forms at 390px; at 1280px they sit at the end of the form as before
- [x] Cardio segment duration, distance and pace share one row at 390px
- [x] History cards: badge, date and Copy on one line; title and summary use the full width
- [x] Templates and Steps actions are 44px buttons with Delete on the far right; Steps dates read "Sun, 4 Oct"
- [x] Overview, Strength and Training Load y-axis labels don't wrap or clip at 390px; Sessions per week shows whole-number ticks; tapping a heatmap day shows its tooltip; `</>` hidden below 640px; empty charts say "No data yet"
- [x] The Plan week title fits on one line; Plan vs. Actual labels aren't cut off
- [x] `index.css` defines the semantic tokens with the interim values; the page background is unchanged
- [x] No visual change at 1280px other than the items above

## Group 2 — Workout mode

- [x] Hook test: the same input gives an identical `POST` body from the full form and from workout mode
- [x] Hook test: the draft round-trips (done flags, notes, current exercise, timer end time) and is cleared only after a 2xx save
- [x] Logic tests cover: complete set → rest timer starts; finishing an exercise moves to the next unfinished one; delete + undo restores the set at the same position; editing a done set then Cancel restores its values; Add set copies the last set; adding an exercise appends 3 sets and selects it
- [x] Plan card Start on a strength session opens `/workout` at 390px and `/log` at 1280px
- [x] Switching Full form ↔ Workout mode mid-session keeps every set, note and done flag
- [x] Reloading `/workout` mid-session restores the same exercise, sets and remaining rest time
- [x] A failed save (backend stopped) keeps the draft and shows an error with retry
- [x] The saved session matches what was entered (verify on the session detail page)
- [x] Every control in workout mode is ≥ 44px; the numbers accept typed input
- [ ] Manual: a full workout on an iPhone, with the phone locked mid-workout

## Group 3 — Today + mobile navigation

- [x] `/` and login land on `/today`
- [x] Today shows today's planned sessions; Start, Move to tomorrow and Skip work; a strength Start opens workout mode at 390px
- [x] A Resume card appears when a draft exists and opens the right view
- [x] With nothing planned today the page says so and still offers Quick log
- [x] Below 768px: slim header, profile menu sheet with Templates/Steps/Profile/Settings/Sign out, Today/Plan/Stats tab bar with the correct active tab (Stats active on `/sessions/:id`)
- [x] The tab bar is hidden on `/workout` and `/log`; no content or toast sits under it; with `viewport-fit=cover` the tab bar clears the home indicator _(meta tag and `env(safe-area-inset-bottom)` padding verified; home-indicator clearance itself is device-only, and the toast offset is verified by CSS, not triggered)_
- [x] At 1280px the top nav shows Today first and nothing else changes

## Group 4 — Sage palette + Stats glance

- [x] `index.css` holds the design-system `@theme` block (colour, chart and shadow tokens; the radius tokens are deliberately left out, see `design-system.md`); the old blue scale is gone
- [x] No hard-coded Tailwind palette classes or chart hex colours remain in `src/` outside `index.css` (grep check; exceptions: Strava and Apple Health brand colours, the SVG logo files)
- [x] Text contrast follows the design-system accessibility table (white on `primary-dark` only for small text; `text-muted-strong` for small muted text)
- [x] Charts use `chart-*` tokens; activity colours match the spec
- [x] Stats glance shows at the top of Analytics below 768px with this week, latest PR, 12-week bars and readiness; hidden at 1280px
- [x] Before/after screenshots for every main screen at 390px and Stats/Plan at 1280px
