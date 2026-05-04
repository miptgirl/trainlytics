# Roadmap

The roadmap is organized around three phases. Each phase produces a usable, shippable slice of the product. Phases build on each other — Phase 2 assumes Phase 1 is complete and stable.

---

## Phase 1 — MVP: Core Activity Logging

**Goal:** A user can securely log in from any device and record any workout.

This is the foundation everything else builds on. Auth comes first — all data is personal and protected.

### Deliverables

- [ ] Project scaffold: React frontend + FastAPI backend + PostgreSQL + Docker Compose
- [ ] **Auth** — register (one-time), login/logout, JWT access token + HTTP-only refresh token cookie
- [ ] **Protected routes** — all API endpoints require auth; frontend redirects to login on 401
- [ ] **Cardio logging** — log a session with: activity type, date, total duration, notes; a session is composed of one or more segments (e.g. walk → run → walk), each with its own duration, distance, pace, and heart rate
- [ ] **Strength logging** — log a session with: date, exercises, sets × reps × weight, notes
- [ ] **Workout history** — list of all logged sessions, filterable by type and date range
- [ ] **Session detail view** — full breakdown of a single logged workout
- [ ] **Edit / delete** a logged session

### Definition of Done

A user can log in on both desktop and mobile, log a run and a gym session, and see both in their history with full detail. Unauthenticated requests are rejected.

---

## Phase 2 — Planning & Templates

**Goal:** A user can plan their training week in advance and log against that plan.

### Deliverables

- [ ] **Workout templates** — create, edit, and delete reusable strength session templates (predefined exercises and parameters)
- [ ] **Weekly training plan** — build a week-by-week plan by assigning workouts to days
- [ ] **Log from template** — start a strength session from a saved template, pre-filled
- [ ] **Planned vs. completed view** — see which workouts were done, skipped, or modified vs. the plan
- [ ] **Weekly overview** — summary card showing the week at a glance (volume, completion rate)

### Definition of Done

A user can build a training week, log sessions against it (from templates or ad hoc), and see at a glance how the week went.

---

## Phase 3 — Analytics & Export

**Goal:** A user can understand their progress over time and share it externally.

### Deliverables

- [ ] **Progress charts** — volume over time (weekly strength volume, cardio distance/duration), personal records per exercise
- [ ] **Trend views** — rolling averages, training load over the last 4–12 weeks
- [ ] **Exercise progression** — chart of weight/reps over time for any exercise
- [ ] **Weekly export** — structured plain-text summary of a selected week (workouts, volume, completion) for AI or coach sharing
- [ ] **Dashboard** — landing page with key stats, recent activity, and upcoming plan

### Definition of Done

A user can view a chart of their squat progression, see their training volume trend for the last 8 weeks, and export last week's summary as text.

---

## Out of Scope (for now)

- Multi-user support (single account only)
- Native mobile app (mobile browser is the target)
- Wearable or third-party API integrations (Garmin, Strava, Apple Health)
- Social features
- In-app AI analysis (export + external AI tool is the intended workflow)
