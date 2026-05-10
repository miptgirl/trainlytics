# Roadmap

The roadmap is organized into phases. Each phase produces a usable, shippable slice of the product. Phases build on each other — Phase 2 assumes Phase 1 is complete and stable.

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

## ✅ Phase 2 — Strength Templates *(completed)*

**Goal:** A user can create reusable strength session templates and log against them without having to remember every exercise from scratch.

### Deliverables

- [x] **Strength session templates** — create, edit, and delete reusable templates that define exercises, default sets × reps × weight, and notes
- [x] **Log from template** — when logging a strength session, optionally select a template; all exercises, sets, reps, and weights are pre-filled from the template and fully editable before committing
- [x] **Change detection on commit** — if anything in the logged session differs from the template (exercises added/removed, sets/reps/weight changed), prompt the user: *"Your session differs from the template — do you want to update it?"*
- [x] **Template library** — dedicated screen to browse, create, and manage all templates
- [x] **Set completion tracking** — while logging from a template, mark individual sets as done with a tick button; completed sets are visually distinguished (muted text + strikethrough); completion state is client-only and never persisted

### Definition of Done

A user can create a "Push Day" template with their usual exercises, open it when logging, tweak what changed that day, and optionally save those tweaks back to the template. ✅ **Achieved.**

### Backlog (deferred from Phase 2)

- **Template versioning** — keep a history of past template states so users can see how a template evolved over time; "last saved state" is sufficient for Phase 2
- **Unit preference (kg / lb)** — user-level setting to display and enter weights in kg or lb; all weights are stored in kg internally; Phase 2 UI shows kg only

---

## ✅ Phase 3 — UI Polish & Quality of Life *(completed)*

**Goal:** The interface is polished, vibrant, and pleasant enough to use every day.

### Deliverables

- [x] **Branding** — Trainlytics logo (including motto *"Track. Analyze. Improve"*) displayed in the header/nav on every screen; logo height 56 px
- [x] **Colour & visual identity** — cohesive blue-accent design system applied via Tailwind CSS (primary blue palette, consistent typography, spacing, subtle shadows, rounded cards); **Montserrat** set as the app-wide typeface via the Tailwind `font-sans` override
- [x] **Unified log screen** — `/log-cardio` and `/log-strength` replaced by a single `/log` route; user picks Cardio or Strength and the relevant form renders inline; `?templateId=<id>` pre-selects Strength and loads the template
- [x] **Settings tab** — `/settings` route consolidates Manage Activity Types and Manage Exercises; both removed from top-level nav
- [x] **Richer history screen** — each session row shows type badge and stat summary (strength: exercise count, total volume, duration; cardio: distance km, duration mins, pace min/km); title shown when present
- [x] **Weekly stats summary** — summary card at the top of the History screen showing total minutes and calories split by cardio vs. strength for the current Mon–Sun week; backed by `GET /sessions/weekly-summary`
- [x] **Training trends chart** — stacked area chart (Recharts) below the weekly summary showing cardio and strength minutes (and calories, toggle-able) over the last 12 weeks plus the current in-progress week; backed by `GET /sessions/training-trends`
- [x] **Titles for sessions and segments** — optional `title` field on strength/cardio sessions and on individual cardio segments; displayed in history list and detail views
- [x] **Date & time picker** — `workout_sessions.date` migrated from `Date` to `DateTime(timezone=True)`; log forms default to current local time; stored in UTC; displayed as date + time throughout
- [x] **Cardio units** — all cardio UI shows duration in **mins**, distance in **km**, pace in **min/km**; backend continues to store seconds, metres, seconds-per-km; conversion is frontend-only
- [x] **Calories field** — optional `calories` integer on both session types; entered at log time; summed in weekly summary (nulls excluded); shown in session detail views
- [x] **Exercise notes hint** — when logging strength, exercises that have notes show an inline italic hint below the dropdown

### Definition of Done

A user can open the app, immediately feel at home with a clean blue-accented Montserrat interface, log a workout from a single entry point, add a title and exact time, browse a history that shows meaningful stats per session, see a weekly summary card at the top, and explore a 12-week training trends chart split by cardio and strength. ✅ **Achieved.**

---

## ✅ Phase 4 — Usability & Mobile Polish *(completed)*

**Goal:** The app works smoothly on mobile, daily logging flows are faster and more intuitive, and deployment is straightforward.

### Deliverables

- [x] **Mobile header fix** — nav bar is usable on small screens; "Log Workout" and "Sign Out" no longer clash or overlap
- [x] **Deployment script** — single script to pull the latest build, run `docker compose up`, and apply any pending Alembic migrations; covers both initial setup and incremental updates
- [x] **Exercise type badges** — exercises can carry one or more type tags (e.g. *core*, *lower body*, *upper body*); badges are displayed in the Settings / Manage Exercises screen
- [x] **Exercise picker grouped by type** — when selecting an exercise in the template editor or the strength log form, exercises are grouped by their type badge for easier navigation
- [x] **Template form: add exercise at bottom** — the "Add Exercise" button moves to the bottom of the exercise list for natural top-to-bottom flow
- [x] **Collapsible exercises** — in both the template editor and the strength log form, individual exercises can be collapsed/expanded; exercises auto-collapse when all their sets are marked done
- [x] **Green set completion label** — completed sets are highlighted in green instead of muted/greyed out for better visibility
- [x] **Auto-fill session title** — when logging strength from a template, the title field defaults to the template name; without a template it defaults to *"Strength session"*; for cardio the title defaults to *"&lt;Activity type&gt; – &lt;X&gt; km"* (e.g. *"Run – 8 km"*)
- [x] **Human-readable duration & pace inputs** — duration and pace fields accept and display `h:mm:ss` / `m:ss` format instead of raw numbers

### Definition of Done

A user on a mobile device can navigate the full app without UI collisions, log a strength session from a template with the title pre-filled, collapse finished exercises as they go, and enter cardio duration in a natural time format. ✅ **Achieved.**

---

## ✅ Phase 5 — Mobile Polish & Logging UX *(completed)*

**Goal:** The app is fully usable on a phone without layout issues, weight entry is accident-free, and cardio logging requires less manual calculation.

All items in this phase are driven by direct user feedback.

### Deliverables

- [x] **Remove weight increment/decrement buttons** — weight fields in the strength log form and template editor accept direct text input only; the +/− buttons caused accidental weight changes and are removed
- [x] **Fix mobile duration keyboard** — duration fields trigger a text keyboard on mobile (not a numeric keyboard) so the `h:mm:ss` format can actually be typed; the numeric keyboard was blocking input on iPhone
- [x] **Compact exercise remove button** — the remove control is replaced with a small icon button so it no longer clashes with the full exercise name on narrow screens
- [x] **Mobile responsive audit** — a full pass on viewport overflow; all controls, forms, and buttons fit within the screen width on iPhone-sized viewports with no horizontal scroll
- [x] **Green completed-exercise highlight** — when all sets within an exercise are marked done, the exercise header turns green (matching the per-set green treatment) in addition to auto-collapsing
- [x] **Move "Add Segment" to bottom** — the add-segment control moves below the last segment, consistent with how "Add Exercise" works in the template editor
- [x] **Auto-calculate pace** — in the cardio log form, pace is computed automatically from distance and duration whenever both fields are filled; the pace field updates in real time and can still be overridden manually

### Definition of Done

A user on an iPhone can fill in all fields without keyboard or layout issues, remove an exercise with a small icon, and have pace calculated for them automatically when entering a cardio segment. ✅ **Achieved.**

---

## ✅ Phase 6 — Export & Draft Recovery *(completed)*

**Goal:** A user can share any session as structured text for AI or coach analysis, and never lose a half-filled log form.

Both items are driven by direct user feedback. The export capability is core to the Trainlytics mission of data ownership.

### Deliverables

- [x] **Training summary export** — a "Copy as text" action on both the history list (per session row) and the session detail view produces a structured plain-text summary ready to paste into an LLM or share with a coach; strength sessions include all exercises, sets, reps, and weights; cardio sessions include all segments with distance, duration, and pace
- [x] **Draft auto-save** — the log form saves its in-progress state to `localStorage` as the user types; when opening the log form with a pending unsaved draft, a prompt offers to restore it; drafts are cleared automatically on successful submission

### Definition of Done

A user can tap "Copy as text" on any logged session and paste a clean structured summary into ChatGPT or a coach chat. If they close the log form mid-session by accident, they are offered to restore their work next time they open it. ✅ **Achieved.**

---

## Phase 7 — Analytics Depth

**Goal:** A user can track pace trends over time and monitor their overall daily activity through step counts.

### Deliverables

- [ ] **Pace trends chart** — a new chart tab on the main screen shows average pace over time, filterable by activity type and by segment name within an activity; backed by a new backend aggregation endpoint
- [ ] **Step tracking** — a daily step count can be manually entered (e.g. synced from a phone health app or watch); step totals appear as a line overlay on the existing 12-week training trends chart on the main screen; backed by a new `daily_steps` table and `POST /steps` / `GET /steps` endpoints

### Definition of Done

A user can open the main screen, switch to the pace chart tab, and see how their running pace has changed over recent weeks broken down by activity type. They can also log their daily steps and see them alongside training volume on the 12-week chart.

---

## Phase 8 — Planning & Weekly Overview *(deferred)*

**Goal:** A user can plan their training week in advance and log against that plan.

> Deferred in favour of user-feedback–driven phases (5–7). No active work scheduled.

### Deliverables

- [ ] **Weekly training plan** — build a week-by-week plan by assigning workout templates (or ad-hoc sessions) to days
- [ ] **Planned vs. completed view** — see which workouts were done, skipped, or modified vs. the plan
- [ ] **Weekly overview** — summary card showing the week at a glance (volume, completion rate)

### Definition of Done

A user can build a training week, log sessions against it, and see at a glance how the week went.

---

## Phase 9 — Deep Analytics *(deferred)*

**Goal:** A user can understand strength and cardio progression in detail and export structured summaries.

> Deferred. The export deliverable was elevated to Phase 6 (session-level copy). Phase 9 covers longer-horizon analytics.

### Deliverables

- [ ] **Exercise progression** — chart of weight/reps over time for any exercise (personal records highlighted)
- [ ] **Strength volume breakdown** — weekly total volume per exercise or muscle group, beyond the aggregate already shown in Phase 3
- [ ] **Cardio distance trends** — weekly distance per activity type over time
- [ ] **Rolling averages & training load** — rolling 4-week and 8-week load views built on top of the existing trends API

### Definition of Done

A user can view a chart of their squat progression and drill into weekly volume per exercise.

---

## Out of Scope (for now)

- Multi-user support (single account only)
- Native mobile app (mobile browser is the target)
- Wearable or third-party API integrations (Garmin, Strava, Apple Health)
- Social features
- In-app AI analysis (export + external AI tool is the intended workflow)
