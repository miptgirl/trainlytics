# Phase 17 — Mobile Redesign ("Today-first") Requirements

## Scope

Make Trainlytics a phone-first app for the moment it is used most: logging a strength workout at the gym. The target design is concept **C — Today-first** from the mobile concepts canvas: a Today home with one-tap start, a focused workout mode, and a short stats summary, in the "Minimal & Clean" sage palette from [`specs/design-system.md`](../design-system.md).

Frontend only. No database migrations, no new or changed API endpoints. Everything the design needs already exists:

| Need | Existing source |
|---|---|
| Sets with reps, weight, note, order | `StrengthSetCreate` (`reps`, `weight`, `notes`, `order`) |
| "Last time" numbers | `GET /exercises/{id}/last-session-defaults` |
| Session note, wellbeing, RPE, duration, calories | strength session schema |
| Start from a planned session | `PlannedSessionCard` → `/log?type=strength&templateId=…` |
| Done flags, current exercise, rest timer | browser-only state, kept in the localStorage draft (`draftUtils`) |

Delivered as four stacked pull requests, one per group below. Each one is shippable on its own and leaves the app consistent.

---

## Decisions

### Group 1 — Mobile fundamentals and semantic colour tokens

Fixes the problems seen on a real iPhone (2026-10-04 screenshots) and prepares tokens for the new screens.

1. **No zoom on focus.** iOS Safari zooms in on any field under 16px and stays zoomed. Below 640px, `input`, `select` and `textarea` use 16px text (one rule in `index.css`). Desktop sizes are unchanged.
2. **Scroll to top on navigation.** A pathname change (push/replace, not back/forward) scrolls to the top. Today the Log form opens at the scroll position of the previous page.
3. **Tap targets ≥ 44×44px below `md`** for: set Done/delete, exercise header icons, plan card actions and "Add session", plan week arrows, Templates and Steps row actions, History notes chevron, chart toggles and filter chips.
4. **Strength set rows** (log form and session edit). Below `sm` each set takes two lines: `# · Reps · Weight · Done` then `Note (full width) · Delete`. Delete is never next to Done. Done sets get a tinted row instead of strike-through. "+ Add set" is a full-width button below the last set. At `sm` and up the current single-row grid stays.
5. **Pinned Save.** Both Log forms keep Save/Cancel pinned to the bottom of the screen below `md` (sticky, with safe-area padding).
6. **Compact cardio segments.** Duration, distance and pace sit in one three-column row below the segment title.
7. **History cards.** The type badge and date share the first line with Copy on the right. Title and summary use the full card width.
8. **Templates and Steps.** Row actions become 44px buttons; Delete is an icon button at the far right. Steps dates read "Sun, 4 Oct".
9. **Charts.** Y-axis labels neither wrap nor clip (compact units such as `14k`), count axes use whole numbers, heatmap days show their tooltip on tap, `</>` SQL buttons are hidden below `sm`, and a chart with no data shows "No data yet" instead of empty axes.
10. **Plan page.** Week title on one line ("Sep 28 – Oct 4"), Plan vs. Actual labels not truncated, segment summaries wrap to two lines instead of truncating.
11. **Semantic colour tokens.** Add the design-system token names to `@theme` in `index.css` but with the **current** blue/slate values (table below). New screens in Groups 2–3 use only these tokens, so Group 4 can switch the whole app to sage by changing values. Radius and shadow tokens wait for Group 4 because they would restyle existing components. `--color-surface` currently holds the page background and no class uses it; it becomes white and the page background moves to `--color-bg`.

| Token | Interim value | Group 4 value |
|---|---|---|
| `primary` | `#3b82f6` | `#7E9B76` |
| `primary-dark` | `#2563eb` | `#4F6B52` |
| `primary-light` | `#bfdbfe` | `#B8C9B2` |
| `primary-tint` | `#eff6ff` | `#E6EFE3` |
| `bg` | `#f8fafc` | `#F7F5EF` |
| `surface` | `#ffffff` | `#FFFDF8` |
| `border` | `#e2e8f0` | `#E8E4DA` |
| `text` | `#1e293b` | `#2F342F` |
| `text-muted` | `#64748b` | `#737A70` |
| `text-muted-strong` | `#475569` | `#656B63` |
| `accent` / `accent-light` / `accent-text` | `#f43f5e` / `#ffe4e6` / `#be123c` | spec values |
| `success` / `success-text` | `#16a34a` / `#15803d` | spec values |
| `warning` / `warning-text` | `#f59e0b` / `#b45309` | spec values |
| `error` / `error-text` | `#ef4444` / `#b91c1c` | spec values |

### Group 2 — Workout mode (strength)

A full-screen logger for one set at a time, reachable from a planned strength session. Reference: canvas artboards C2 and C2b.

1. **One shared form hook.** Extract the strength path of `LogWorkoutPage` (state, draft autosave and restore, payload building, save, template-diff prompt, planned-session linking) into a hook used by both the existing form and workout mode. The same input must produce the same `POST` body from either view. This is the main safety guarantee.
2. **Draft is the source of truth until the server confirms.** Autosave on every change (debounce ≤ 500ms). Workout mode and the full form share the draft, so switching views mid-workout loses nothing. The draft is cleared only after a successful save; a failed save keeps it and offers retry.
3. **Route** `/workout`, taking the same query parameters as the strength form. Entry points:
   - Plan card **Start** on a strength session opens `/workout` below 768px and `/log` at 768px and up (checked at click time).
   - The strength form has a **Workout mode** button; workout mode has **Full form**.
4. **Screen layout** (top to bottom):
   - **Header:** close (keeps the draft), title, "N of M sets · K of L exercises", **Finish**.
   - **Exercise:** "Exercise N of M", name (wraps), "Last time: 4 × 8 @ 57.5 kg" from last-session defaults.
   - **Set list:**
     - Done sets are compact rows showing reps × kg, a ✓ and the note on a second line. Tapping one opens it for editing with **Cancel** (restores the values from before) and **Save set N**. A done set stays done.
     - The current set is a large editor: −/+ for reps (step 1) and kg (step 2.5), with the numbers themselves as inputs you can tap and type into. It has an **Add note** field and **Complete set**.
     - Upcoming sets are grey rows.
     - Every set has a delete button. Deleting shows "Set N deleted · Undo" for 5 seconds. The last remaining set cannot be deleted.
     - **Add set** copies the last set's values.
   - **Bottom bar:** rest timer above **Choose exercise** and **Next: ‹next unfinished›**.
5. **Choose exercise** sheet: **To do** (unfinished, plan order, current highlighted, "1 of 3 sets · last …") and **Done** (muted, still tappable), plus **Add exercise** that searches the exercise library (existing picker data) and appends the exercise with 3 empty sets. Rows are ≥ 64px and names wrap.
6. **Automatic advance.** Completing the last set of an exercise moves to the next unfinished one.
7. **Rest timer.**
   - Completing a set starts it. It has **Reset**, **+30s** and **Skip**.
   - It stores an end timestamp (in the draft) and recomputes from `Date.now()`, so it survives the tab being backgrounded or reloaded.
   - Rest length defaults to 90s and is adjustable (60/90/120/180s), stored in localStorage.
   - It vibrates at zero where `navigator.vibrate` exists.
8. **Finish sheet.** Duration (prefilled from elapsed time, editable), how you feel and how hard it was (existing `EmojiRating`), session note, optional calories, then **Save**. Navigation after saving matches the current form.
9. **Screen Wake Lock** while workout mode is open, where supported.
10. **Saved order.** Exercises are saved in list order: plan order, then any added exercises.

### Group 3 — Today screen and mobile navigation

Reference: canvas artboard C1.

1. **`/today` page.**
   - **Header:** today's date, plus a profile button that opens the menu.
   - **Session cards:** one for each session planned today, with **Start** (strength → `/workout` per Group 2, cardio → `/log`), **Move to tomorrow** (existing reschedule API/modal) and **Skip** (existing `SkipNoteModal`).
   - **Resume card:** shown when a strength or cardio draft exists.
   - **No sessions planned:** a "Nothing planned today" note.
   - **Quick log:** Cardio, Strength and Steps.
   - **This week card:** done of planned, and the next upcoming session.
2. `/` and the post-login landing go to `/today` at all widths.
3. **Mobile shell below 768px:**
   - Slim header (logo without tagline) with a profile/menu button that opens a sheet: Templates, Steps, Profile, Settings, Sign out.
   - Bottom tab bar: **Today · Plan · Stats**. It is hidden on `/workout` and `/log`, where the pinned Save bar takes the space.
   - **Safe area:** `viewport-fit=cover`, tab bar padded by `env(safe-area-inset-bottom)`, content padded so nothing hides under the bar, Plan toast above the bar.
4. **Active tab:** Today for `/today`; Plan for `/plan`; Stats for `/stats` and `/sessions/*`.
5. **Desktop:** the top nav gains **Today** as its first link and is otherwise unchanged.

### Group 4 — Sage palette and Stats glance

1. **Switch the tokens** to the design-system values: the full spec `@theme` block, including radius, shadow and chart tokens. Delete the old `--color-primary-50…900` scale. Update `theme-color` and the manifest colours if they don't match.
2. **Remove hard-coded colours.**
   - Replace the ~1,370 hard-coded palette classes (`blue-*`, `slate-*`, `gray-*`, `green-*`, …) across ~55 files with semantic tokens.
   - Replace hex colours in charts with `chart-*` tokens (one colour per activity type) and a sage ramp for the heatmap.
   - Follow the spec's component recipes (primary, secondary and destructive buttons, chips, inputs, progress bars, bottom nav) and its accessibility rules: white text only on `primary-dark` unless large, and `text-muted-strong` for small muted text.
3. **Stats glance (C3)**, at the top of the Analytics tab below `md`:
   - this week's sessions done/planned, training time and km run
   - the latest personal record
   - 12 weeks of training time as small bars
   - average feeling and effort over the last 7 days

   The existing analytics follow unchanged. All of it comes from existing analytics endpoints.

---

## Out of scope

- Per-set RPE as its own field (needs a migration; notes carry it for now).
- Workout mode for cardio.
- Native app, push notifications, offline sync beyond the localStorage draft.
