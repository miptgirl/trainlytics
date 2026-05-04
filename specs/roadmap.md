# Roadmap

The roadmap is organized around three phases. Each phase produces a usable, shippable slice of the product. Phases build on each other — Phase 2 assumes Phase 1 is complete and stable.

---

## ✅ Phase 1 — MVP: Core Activity Logging *(completed)*

**Goal:** A user can securely log in from any device and record any workout.

This is the foundation everything else builds on. Auth comes first — all data is personal and protected.

### Deliverables

- [x] Project scaffold: React frontend + FastAPI backend + PostgreSQL + Docker Compose
- [x] **Auth** — accounts defined via environment variables (no registration UI), login/logout, JWT access token + HTTP-only refresh token cookie; multiple accounts supported
- [x] **Protected routes** — all API endpoints require auth; frontend redirects to login on 401
- [x] **Cardio logging** — log a session with: activity type, date, total duration, notes; a session is composed of one or more segments (e.g. walk → run → walk), each with its own duration, distance, pace, and heart rate
- [x] **Strength logging** — log a session with: date, exercises, sets × reps × weight, notes
- [x] **Workout history** — list of all logged sessions, filterable by type and date range
- [x] **Session detail view** — full breakdown of a single logged workout
- [x] **Edit / delete** a logged session

### Definition of Done

A user can log in on both desktop and mobile, log a run and a gym session, and see both in their history with full detail. Unauthenticated requests are rejected. ✅ **Achieved.**

---

## Phase 2 — Strength Templates

**Goal:** A user can create reusable strength session templates and log against them without having to remember every exercise from scratch.

### Deliverables

- [ ] **Strength session templates** — create, edit, and delete reusable templates that define exercises, default sets × reps × weight, and notes
- [ ] **Log from template** — when logging a strength session, optionally select a template; all exercises, sets, reps, and weights are pre-filled from the template and fully editable before committing
- [ ] **Change detection on commit** — if anything in the logged session differs from the template (exercises added/removed, sets/reps/weight changed), prompt the user: *"Your session differs from the template — do you want to update it?"*
- [ ] **Template library** — dedicated screen to browse, create, and manage all templates

### Definition of Done

A user can create a "Push Day" template with their usual exercises, open it when logging, tweak what changed that day, and optionally save those tweaks back to the template.

### Backlog (deferred from Phase 2)

- **Template versioning** — keep a history of past template states so users can see how a template evolved over time; "last saved state" is sufficient for Phase 2
- **Unit preference (kg / lb)** — user-level setting to display and enter weights in kg or lb; all weights are stored in kg internally; Phase 2 UI shows kg only

---

## Phase 3 — UI Polish & Quality of Life

**Goal:** The interface is polished, vibrant, and pleasant enough to use every day.

### Deliverables

- [ ] **Branding** — display the Trainlytics logo and motto prominently in the header/nav
- [ ] **Colour & visual identity** — apply a cohesive blue-accent design system (primary shades of blue, consistent typography, spacing); replace the current flat/bare look with a more vibrant, modern UI
- [ ] **Unified log screen** — merge cardio and strength logging into a single *Log Workout* entry point; the user picks the type and the relevant form is shown inline
- [ ] **Settings tab** — single settings screen for managing activity types (cardio) and exercises (strength); removed from the main nav flow
- [ ] **Richer history screen** — show key stats for each session in the list (e.g. for strength: total volume, number of exercises; for cardio: distance, duration, pace); make sessions visually distinct by type
- [ ] **Weekly stats summary** — at the top of the history screen, show a weekly summary card with total minutes and calories split by cardio vs. strength for the current week
- [ ] **Titles for sessions and segments** — allow users to give a custom title to any strength or cardio session and to individual cardio segments (e.g. "Warmup jog", "Tempo block")
- [ ] **Date & time picker** — replace date-only input with a date + time picker so sessions can be timestamped precisely
- [ ] **Cardio units** — switch all cardio units to: duration in **mins**, distance in **km**, pace in **min/km**

### Definition of Done

A user can open the app, immediately feel at home with a clean blue-accented interface, log a workout from a single entry point, add a title and exact time, browse a history that shows meaningful stats per session, and see a weekly summary card at the top showing minutes and calories split by cardio vs. strength.

---

## Phase 4 — Planning & Weekly Overview

**Goal:** A user can plan their training week in advance and log against that plan.

### Deliverables

- [ ] **Weekly training plan** — build a week-by-week plan by assigning workout templates (or ad-hoc sessions) to days
- [ ] **Planned vs. completed view** — see which workouts were done, skipped, or modified vs. the plan
- [ ] **Weekly overview** — summary card showing the week at a glance (volume, completion rate)

### Definition of Done

A user can build a training week, log sessions against it, and see at a glance how the week went.

---

## Phase 5 — Analytics & Export

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
