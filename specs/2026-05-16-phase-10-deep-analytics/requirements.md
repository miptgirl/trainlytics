# Phase 10 — Deep Analytics: Requirements

## Goal

A dedicated analytics experience giving the user a rich, multi-dimensional view of their training — strength progression, cardio trends, readiness patterns, and consistency — all in one place.

---

## Scope

### In scope

- New `/analytics` top-level route and nav tab
- All-time summary header (total time, total sessions, total distance)
- History screen fix: filter empty weeks from the 12-week training trends chart
- Strength analytics: exercise progression chart, personal records panel (broken down by exercise type tag), strength volume breakdown by muscle-group tag
- Cardio analytics: activity type time split, avg walk segments per run session trend, cardio distance progression (rolling monthly), rolling 4-week and 8-week training load
- Readiness analytics: wellbeing & RPE trend chart, wellbeing ↔ RPE correlation scatter (sessions with null wellbeing or RPE excluded)
- Consistency: training heatmap (last 12 months), day colour-coded by session type with split colour when both strength and cardio are logged the same day

### Out of scope

- No new data entry flows — all data comes from existing `workout_sessions`, `exercises`, `cardio_activity_types`, and `daily_steps` tables
- No AI integration in this phase
- No export from the Analytics tab (export already exists on individual sessions in Phase 6)

---

## Key Decisions

### Routing & navigation
- `/analytics` is a new top-level page, added to the main nav alongside History, Log, Templates, Settings, Profile
- All charts and panels for this phase live on `/analytics` exclusively; the History screen keeps its existing weekly summary and 12-week trends chart unchanged (except the empty-weeks fix)

### Backend endpoints
New endpoints grouped under `/analytics/`:

| Endpoint | Purpose |
|---|---|
| `GET /analytics/summary` | All-time totals: total sessions, total training minutes, total cardio distance (km) |
| `GET /analytics/strength/progression?exercise_id=` | Per-exercise weight/volume over time; returns per-session `(date, max_weight, total_volume)` |
| `GET /analytics/strength/records` | All-time PR per exercise, grouped by exercise type tag: heaviest weight, best single-set volume |
| `GET /analytics/strength/volume-by-tag` | Weekly total volume (kg × reps) per exercise type tag, last N weeks |
| `GET /analytics/cardio/time-split?period=` | Total cardio minutes per activity type over a selectable period |
| `GET /analytics/cardio/walk-segments` | Per run session: number of walk segments (0 when none); returned as time series for trend rendering |
| `GET /analytics/cardio/distance-progression` | Rolling monthly cumulative distance per activity type |
| `GET /analytics/training-load` | Rolling 4-week and 8-week load (total minutes + total distance) — new dedicated endpoint |
| `GET /analytics/readiness/trends` | Weekly avg wellbeing and avg RPE per week |
| `GET /analytics/readiness/correlation` | Per-session `(wellbeing, rpe, type, date)` tuples; null wellbeing or RPE rows excluded server-side |
| `GET /analytics/heatmap` | Flat list of `(date, session_types[])` for the last 365 days |
| `GET /sessions/training-trends` (extend) | Add `skip_empty_weeks` query param (default `true`) used by the History screen fix |

All aggregations computed server-side in Python; frontend receives pre-aggregated data and renders with Recharts.

### Walk segments metric
- All cardio sessions of any type are candidates (not only explicit "Run" sessions)
- For a session: count segments whose activity type name matches "Walk" (case-insensitive)
- If a session has zero walk segments, it contributes `0` to the trend
- Sessions that consist *only* of walk segments contribute their walk segment count as-is
- Result is a time series of `(date, session_title, walk_segment_count)` suitable for a trend/bar chart

### Personal records — grouped by exercise type tag
- PRs are computed per `(exercise_id, type_tag)` pair
- An exercise with multiple type tags appears under each tag it belongs to
- Three PR dimensions per exercise: heaviest single-set weight, most reps at the heaviest weight, best single-set volume (weight × reps)

### Heatmap colour split
- Day with strength only → strength colour
- Day with cardio only → cardio colour
- Day with both → split colour (half strength / half cardio, rendered as a diagonal split or two-tone square)
- Day with no sessions → rest / empty

### Cardio distance progression
- Rolling monthly window (last 30 days ending on each calendar month boundary)
- One series per activity type that has at least one session with distance > 0

### Rolling training load
- Delivered by a new `GET /analytics/training-load` endpoint (keeps `GET /sessions/training-trends` focused on the History chart)
- Returns two rolling windows (4-week and 8-week), each as a time series of `(week_start, total_minutes, total_distance_km)`

---

## Context

This phase is the first dedicated analytics surface in Trainlytics. Prior analytics (weekly summary card, 12-week trends chart, pace chart tab) live on the History screen and are not moved. The Analytics tab is additive — it builds on top of the full historical dataset that has accumulated through Phases 1–9.

Data foundations already in place:
- `workout_sessions` — strength and cardio sessions with `wellbeing` and `rpe` columns (added Phase 8)
- `exercises` and `exercise_type` — many-to-many exercise type tags (added Phase 4)
- `cardio_activity_type` — activity type per cardio segment
- `daily_steps` — daily step counts (added Phase 7)

The frontend stack (React, Recharts, React Query, Tailwind) and backend stack (FastAPI, SQLAlchemy async, PostgreSQL) are unchanged.
