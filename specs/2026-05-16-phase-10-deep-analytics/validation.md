# Phase 10 — Deep Analytics: Validation

## Definition of Done

A user can open the Analytics tab and see:

- Their all-time training summary at a glance (total time, sessions, distance)
- How their squat weight (or any exercise) has progressed and where their PRs sit, grouped by exercise type tag
- How their weekly strength volume is distributed across muscle-group tags
- How cardio time splits across activity types over a selectable period
- Whether their walk-segment frequency per session is trending down as running fitness improves (zero shown when no walks)
- Their rolling monthly cumulative distance per activity type
- Their rolling 4-week and 8-week training load
- How wellbeing and RPE track against each other week by week
- A scatter of wellbeing vs. RPE across all sessions, with a trend line and type filter
- A full-year heatmap showing streaks, rest days, and a split colour when both session types were logged on the same day

The History screen 12-week trends chart no longer shows empty zero-height bars for weeks with no training.

---

## Automated Tests

### Backend (`pytest`) ✅ — All 167 tests passing (2026-05-16)

All tests in `tests/test_analytics.py` pass:

- ✅ `GET /analytics/summary` — zeros with no data; correct totals with mixed session types
- ✅ `GET /analytics/strength/progression` — empty list for unknown exercise; correct `(date, max_weight, total_volume)` per session
- ✅ `GET /analytics/strength/records` — correct PRs per `(exercise, type_tag)` pair; untagged exercises in `"untagged"` group
- ✅ `GET /analytics/strength/volume-by-tag` — correct weekly aggregation per tag across multiple weeks
- ✅ `GET /analytics/cardio/time-split` — correct minute totals per activity type
- ✅ `GET /analytics/cardio/walk-segments` — walk+run session returns correct count; no-walk session returns `0`; walk-only session returns walk segment count
- ✅ `GET /analytics/cardio/distance-progression` — activity types with no distance excluded; rolling monthly values correct
- ✅ `GET /analytics/training-load` — 4-week and 8-week rolling windows correct
- ✅ `GET /analytics/readiness/trends` — null wellbeing/RPE rows excluded from weekly averages
- ✅ `GET /analytics/readiness/correlation` — null rows excluded; returned tuples correct
- ✅ `GET /analytics/heatmap` — single-type day has one entry in `session_types`; dual-type day has both; dates with no sessions are absent
- ✅ `GET /sessions/training-trends?skip_empty_weeks=true` — weeks with zero minutes not present in response
- ✅ `GET /sessions/training-trends?skip_empty_weeks=false` — empty weeks present in response (regression guard)

### Frontend (`vitest`)

- `ConsistencyHeatmap` — streak calculation: correct current streak with consecutive days; correct longest streak; streak resets on gap day
- `AnalyticsPage` — renders all section headings; shows loading skeleton while data is fetching; shows empty-state message per section when API returns empty arrays
- `WellbeingCorrelationChart` — sessions with null wellbeing or RPE not rendered; type filter hides/shows correct points

---

## Manual Validation (Local Deployment)

### Setup

1. Ensure the app is running locally: `docker compose up --build`
2. Apply any pending migrations: `docker compose exec backend uv run alembic upgrade head`
3. Log in at [http://localhost:5173](http://localhost:5173)
4. Confirm you have at least several weeks of logged sessions (both strength and cardio) with wellbeing/RPE ratings on some of them; if not, seed a few via the log form before proceeding

### Navigation

- [ ] "Analytics" appears in the main nav bar; clicking it navigates to `/analytics`
- [ ] Nav bar does not overflow or wrap awkwardly on mobile (test at 390 px viewport width)
- [ ] All other nav links still work correctly

### All-time Summary Header ✅

- [ ] Total sessions count matches the number of sessions visible in the History screen
- [ ] Total time is non-zero and formatted as `Xh Ym`
- [ ] Total distance (km) reflects your cardio sessions with distance logged

### History Screen Fix

- [ ] Open the History screen; the 12-week trends chart contains no empty bars for weeks with no logged sessions

### Strength Analytics

- [ ] Select an exercise from the progression chart dropdown; a line chart appears showing weight over time; PR data points are visually distinct
- [ ] Toggle volume series on/off; chart updates correctly
- [ ] The Personal Records panel shows exercises grouped by their type tags; exercises without tags appear under "Untagged"
- [ ] Strength volume breakdown chart shows stacked bars per week; each colour corresponds to a different muscle-group tag

### Cardio Analytics

- [ ] Activity type time split chart shows correct proportions; period selector changes the data (try 30 / 90 / all-time)
- [ ] Walk segments trend chart shows bars per session; sessions with no walk segments show as 0
- [ ] Distance progression chart shows one line per activity type with distance > 0
- [ ] Training load chart shows two lines (4-week and 8-week); toggle between minutes and distance

### Readiness Analytics

- [ ] Wellbeing & RPE trends chart shows two lines; weeks with no readiness data show as gaps (not zero)
- [ ] Correlation scatter shows one dot per session (with both wellbeing and RPE set); trend line visible; type filter (strength / cardio) hides/shows the correct dots

### Consistency Heatmap

- [ ] Last 365 days are rendered as a calendar grid
- [ ] Days with strength only, cardio only, both, and rest are visually distinct
- [ ] Hover a day with both session types: tooltip shows the date and both types; the cell renders as a split colour (not a single solid colour)
- [ ] Current streak and longest streak values are shown below the grid and are plausible given your history

### Empty States

- [ ] For any metric with no data (e.g. select an exercise never logged), a friendly message is shown instead of a broken or empty chart

### Mobile

- [ ] All sections on `/analytics` are scrollable and readable on a 390 px viewport; no horizontal overflow; charts resize correctly inside their containers

---

## Merge Checklist

- [ ] All `tests/test_analytics.py` tests pass (`docker compose exec backend uv run pytest tests/test_analytics.py -v`)
- [ ] `test_sessions.py` regression tests for `skip_empty_weeks` pass
- [ ] Frontend tests pass (`pnpm --prefix frontend test run`)
- [ ] No TypeScript errors (`pnpm --prefix frontend tsc --noEmit`)
- [ ] No Ruff lint errors (`docker compose exec backend uv run ruff check app/`)
- [ ] Manual validation checklist above completed with no blocking issues
- [ ] New Alembic migration (if any schema change) runs cleanly: `alembic upgrade head` and `alembic downgrade -1` both succeed
