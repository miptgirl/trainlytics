# Phase 17 — Implementation Plan

Four stacked pull requests, one per group in [requirements.md](requirements.md). Each branch builds on the previous one.

| PR | Branch | Base |
|---|---|---|
| 1 — Mobile fundamentals + semantic tokens | `mobile/1-basics-tokens` | `main` |
| 2 — Workout mode | `mobile/2-workout-mode` | `mobile/1-basics-tokens` |
| 3 — Today + mobile navigation | `mobile/3-today-tabs` | `mobile/2-workout-mode` |
| 4 — Sage palette + Stats glance | `mobile/4-sage-palette` | `mobile/3-today-tabs` |

## Landing

Merge in order 1 → 4.
- **Merge commit or rebase-merge:** each following PR lands with no extra work once GitHub retargets it to `main`.
- **Squash-merge:** before merging the next PR, rebase it onto `main` with `git rebase --onto origin/main <old-base-tip> <branch>` and force-push.

## Order of work and why

1. **Group 1 first.** These are small, independent fixes. The semantic tokens let Groups 2–3 avoid hard-coded colours.
2. **Group 2 next, because it carries the most risk.**
   - First extract the strength form hook with no change in behaviour, and add a test that both views send the same request body.
   - Then build workout mode on top of the hook.
   - The full form remains a fallback reachable from inside workout mode.
3. **Group 3** adds the Today page and the mobile tab bar. It only adds routes and navigation, so it doesn't touch the logging logic.
4. **Group 4 last.** It is a mechanical restyle across many files and carries no behaviour changes, so a visual regression can't hide a logic one. Doing it last also means each screen is recoloured once.

## Verification per PR

- `pnpm test`, `pnpm lint`, `pnpm build` in `frontend/`. No backend changes; backend tests are unaffected.
- **Screenshots:** "Before"/"After" at 390×844 (and 1280×900 where desktop changes) against the demo dataset (`bash scripts/seed-demo.sh`, log in as `demo`/`demo`). They are attached to the PR description.
- **Group 2 only:** run a real workout on an iPhone, including locking the phone mid-workout, before switching the plan card's Start to workout mode by default.

## Files likely touched

- **Group 1:** `index.css`, `App.tsx` (scroll reset), `ExerciseEntryBlock.tsx`, `StrengthSessionDetailPage.tsx`, `LogWorkoutPage.tsx`, `HistoryPage.tsx`, `TemplatesPage.tsx`, `StepsPage.tsx`, `plan/*`, `analytics/*`.
- **Group 2:** new `hooks/useStrengthSessionForm.ts`, `pages/WorkoutModePage.tsx`, `components/workout/*`; `LogWorkoutPage.tsx` refactored onto the hook; `PlannedSessionCard.tsx` entry point.
- **Group 3:** new `pages/TodayPage.tsx`, `Layout.tsx` (mobile shell, tab bar, menu sheet), `App.tsx` routes, `index.html` viewport.
- **Group 4:** `index.css` tokens and every component with palette classes or chart hex colours; new `analytics/StatsGlance.tsx`.
