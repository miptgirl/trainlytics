# Phase 7 — Analytics Depth: Requirements

## Goal

A user can track pace trends over time and monitor their daily activity through step counts.

---

## Scope

### 1. Pace Trends Chart

A new tab on the History screen (alongside the existing 12-week training trends chart) shows how average pace has changed over recent weeks.

**Behaviour:**
- X-axis: weekly buckets, same 12-week rolling window as the training trends chart
- Y-axis: average pace in min/km (lower = faster)
- Filterable by **activity type** (e.g. Run, Cycle) — each selected type is a separate line
- Breakdown by **segment position within a session** — "Segment 1", "Segment 2", etc., so a user can isolate e.g. their warm-up pace vs. main-effort pace across weeks; segments with a title display that title instead of a positional label
- Sessions/segments with no distance or duration are excluded from pace calculations
- Backed by a new backend endpoint: `GET /sessions/pace-trends`

**Clarified decisions:**
- Weekly averages (not per-session data points) — consistent with training trends
- Segment breakdown is by position/label, not a filter (all segment lines are shown simultaneously, togglable via legend)

### 2. Step Tracking

A user can manually log their daily step count (e.g. copied from a phone health app or watch).

**Data model:**
- New `daily_steps` table: `id`, `user_id`, `date` (unique per user per day), `steps` (integer), `created_at`, `updated_at`
- One entry per calendar day; submitting for an existing date overwrites the count (upsert)

**API:**
- `POST /steps` — create or update the step count for a given date
- `GET /steps?start_date=&end_date=` — return step entries for a date range

**Entry UX:**
- Dedicated `/steps` screen: shows a list of recent step entries by date with the ability to add a new entry or edit an existing one
- Accessible from the Settings tab (consistent with how other data management is grouped)

**Chart integration:**
- Step totals appear as a line overlay on the existing 12-week training trends chart on the History screen
- Steps use a secondary right-side y-axis (distinct from the minutes/calories axis) to avoid scale mismatch
- The step line is always shown if any step data exists in the window; no toggle needed for MVP

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Pace x-axis | Weekly averages | Consistent with training trends chart; reduces noise |
| Segment breakdown | By position + title | Lets users isolate warm-up vs. effort paces across weeks |
| Step upsert | Overwrite on same date | Simpler than append; one canonical count per day |
| Step entry location | `/steps` screen in Settings | Consistent with other data-management screens |
| Step axis | Secondary y-axis | Steps (thousands) vs. minutes (tens) are incompatible scales |

---

## Out of Scope for Phase 7

- Automatic step sync from any external API or health platform
- Heart rate trends
- Cardio distance trends (Phase 9)
- Exercise progression charts (Phase 9)
