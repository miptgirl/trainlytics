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
- **Unit preference (kg / lb)** — deferred to Phase 9 user profile page; all weights are stored in kg internally; UI shows kg only until then

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

## ✅ Phase 7 — Analytics Depth *(completed)*

**Goal:** A user can track pace trends over time and monitor their overall daily activity through step counts.

### Deliverables

- [x] **Pace trends chart** — a new chart tab on the main screen shows average pace over time, filterable by activity type and by segment name within an activity; backed by a new backend aggregation endpoint
- [x] **Step tracking** — a daily step count can be manually entered (e.g. synced from a phone health app or watch); step totals appear as a line overlay on the existing 12-week training trends chart on the main screen; backed by a new `daily_steps` table and `POST /steps` / `GET /steps` endpoints

### Definition of Done

A user can open the main screen, switch to the pace chart tab, and see how their running pace has changed over recent weeks broken down by activity type. They can also log their daily steps and see them alongside training volume on the 12-week chart. ✅ **Achieved.**

---

## ✅ Phase 8 — Smart Logging & Athlete Readiness *(completed)*

**Goal:** Logging a session becomes smarter and more personalized — exercises come pre-filled with last-session weights, swaps are one tap away, and the app captures how the athlete felt before and after each session.

All items are driven by direct user feedback.

### Deliverables

- [x] **Wellbeing & RPE capture** — two 5-grade icon scales added to the strength and cardio log forms, placed near the notes field: one for pre-training wellbeing (how you feel going in) and one for post-session perceived difficulty (RPE); icon-based input keeps it fast on mobile; both fields are optional and stored per session; backed by two new columns on `workout_sessions`
- [x] **Smart exercise defaults** — when adding an exercise to a strength log or template, the form pre-fills sets, reps, and weight from the most recent logged session that included that exercise; the user can override freely before saving
- [x] **Exercise replacements** — in Settings / Manage Exercises, a user can define a list of replacement exercises for each exercise (grouped by muscle group); when logging a strength session or editing a template, a swap control lets the user replace any exercise with one of its defined replacements in one tap, inheriting the same default params
- [x] **Clear notes button** — a small icon button next to the notes field lets the user wipe the notes in one tap

### Definition of Done

A user can open the log form, rate how they feel with an icon tap, pick an exercise and see last session's weight already filled in, swap it for a replacement if needed, and clear their notes without selecting all text manually. ✅ **Achieved.**

---

## ✅ Phase 9 — AI Training Coach *(completed)*

**Goal:** The app uses an LLM to analyze the last week of training and help the user adapt a planned session when something feels off — exercises to swap, volume to cut, movements to skip — without leaving Trainlytics. A user profile page provides a home for per-user settings including the AI API key.

### Deliverables

- [x] **User profile page** — `/profile` route linked from the nav; stores per-user preferences in a new `user_settings` table; fields: display name, birth year, experience level, training goals (ordered list with high/medium/low priority), injury notes, AI coach notes; backed by `GET /profile` and `PATCH /profile`
- [x] **API key configuration** — Anthropic and OpenAI keys stored encrypted (Fernet + PBKDF2-HMAC-SHA256 from `SECRET_KEY`); masked input with toggle-reveal, Save (shows "Configured ✓") and Remove; provider selector shown when both keys are set; raw keys never returned to the frontend; AI features show a "Configure your key in Profile" prompt when no key is set
- [x] **Athlete context block** — every AI prompt is prepended with a structured profile block (experience, age, goals sorted by priority, injury notes, coach notes); fields omitted when not set
- [x] **Weekly insights panel** — "AI Insights" card on the History screen below the weekly summary; "Analyse this week" calls `POST /ai/weekly-insights`; compacted 6-week training history sent to Claude Sonnet or GPT-4o; response rendered as markdown with spinner, error, and retry states
- [x] **Adaptive session helper** — "Adapt this session" button in the strength log form opens a modal; user describes a complaint in free text; `POST /ai/adapt-session` sends session snapshot + 4-week history + athlete context; suggestions rendered as markdown
- [x] **AI request logging** — every call (success or failure) writes a row to `ai_request_logs` with endpoint, provider, model, full prompt, response, token counts, duration, and error; log write failures silently swallowed
- [x] **Debug log viewer** — collapsible "Debug — AI request logs" panel at the bottom of `/profile`; shows last 20 calls with expandable prompt, rendered response, token counts, duration, and error; backed by `GET /ai/logs`

### Technical notes

- All AI endpoints live in the backend (`app/api/ai.py`, `app/services/ai_service.py`); the frontend never holds or transmits the API key
- `compact_sets` / `compact_cardio_segments` helpers collapse consecutive identical sets/segments into `N×reps@weight` / `N×dist@pace` notation for concise prompts
- Both Anthropic (Claude Sonnet) and OpenAI (GPT-4o) supported; active provider resolved from `user_settings.ai_provider` at call time
- Anthropic prompt caching applied to the athlete context block

### Definition of Done

A user can open their profile, enter their Anthropic or OpenAI API key, then: tap "Analyse this week" on the History screen to get an AI comparison against the previous 5 weeks, and — when opening any strength log form — describe a physical complaint and receive specific modification suggestions. ✅ **Achieved.**

---

## ✅ Phase 10 — Deep Analytics *(completed)*

**Goal:** A dedicated analytics experience giving the user a rich, multi-dimensional view of their training — strength progression, cardio trends, readiness patterns, and consistency — all in one place.

### Deliverables

#### Analytics tab
- [x] **Dedicated `/analytics` route** — new top-level nav tab; all charts and panels below live here, not on the History screen

#### Overall stats
- [x] **All-time summary header** — top of the Analytics page shows: total time on sport (formatted as hours), total sessions logged, and total distance run (km); computed server-side

#### History screen fix
- [x] **Filter empty weeks** — the 12-week training trends chart on the History screen only renders weeks that have at least one logged session; empty weeks are skipped rather than shown as zero-height bars

#### Strength analytics
- [x] **Exercise progression chart** — line chart of weight (or volume = weight × reps) over time for any selected exercise; personal records (heaviest single set, best total volume) are highlighted with a marker; backed by a new backend aggregation endpoint
- [x] **Personal records panel** — summary card listing the all-time PR per exercise (heaviest weight lifted, most reps at a given weight, best single-set volume); updates automatically as new sessions are logged
- [x] **Strength volume breakdown** — weekly total volume (kg × reps) per exercise or muscle-group tag, as a stacked bar chart; lets the user see how volume shifts between muscle groups over time

#### Cardio analytics
- [x] **Activity type time split** — bar or pie chart showing how total cardio time is distributed across activity types (e.g. Run, Walk, Cycle) over a selectable period; makes it easy to see "I'm running more and walking less"
- [x] **Avg walk segments per run session** — for sessions whose segments include at least one Walk segment alongside a Run segment, compute the average number of Walk segments per session over time; displayed as a trend line; uses existing cardio segment activity types — no new data model needed
- [x] **Cardio distance progression** — cumulative distance per activity type plotted over time (monthly granularity); shows long-horizon growth like "I've run 200 km this year"
- [x] **Rolling averages & training load** — rolling 4-week and 8-week load views (total minutes and total distance) built on top of the existing trends API; helps spot overtraining and deload periods

#### Readiness & wellbeing analytics
- [x] **Wellbeing & RPE trends** — dual-line chart of average pre-training wellbeing score and average post-session RPE per week; shows whether readiness is improving or declining over time
- [x] **Wellbeing ↔ performance correlation** — scatter chart with pre-training wellbeing on the x-axis and post-session RPE on the y-axis, one dot per session; a trend line indicates whether higher wellbeing predicts easier sessions; sessions can be filtered by type

#### Consistency
- [x] **Training consistency heatmap** — GitHub-style calendar heatmap covering the last 12 months; each day is colour-coded by session type (strength / cardio / rest); current and longest streaks are shown below the heatmap

### Technical notes

- All aggregations are computed server-side in Python; the frontend receives pre-aggregated data suitable for direct rendering with Recharts
- New backend endpoints grouped under `/analytics/*` (or extend existing `/sessions/*` aggregation endpoints where natural)
- Wellbeing correlation endpoint returns raw per-session `(wellbeing, rpe, type, date)` tuples — the frontend handles rendering
- Heatmap endpoint returns a flat list of `(date, session_type)` entries for the last 365 days

### Definition of Done

A user can open the Analytics tab and see: their all-time training summary at a glance; how their squat weight has progressed and where their PRs sit; how their cardio time splits across run vs. walk vs. cycle; whether their walk-break frequency is declining over time as running fitness improves; their cumulative distance covered; how wellbeing and RPE track over weeks; and a full-year heatmap showing streaks and consistency. ✅ **Achieved.**

---

## ✅ Phase 11 — Planning & Weekly Overview *(completed)*

**Goal:** A user can plan their training week in advance and log against that plan.

### Deliverables

- [x] **Weekly training plan** — `/plan` tab in the nav bar; build a week by adding strength sessions (choose a template) or cardio sessions (choose activity type + one or more distance/duration segments); Mon–Sun grid with `←` / `→` week navigation
- [x] **Planned vs. completed view** — each planned session shows a live-computed status: **Planned** (future, no log), **Done** (matched log found for that day), or **Skipped** (past day, no match); strength matched by template, cardio matched by activity type
- [x] **Weekly overview** — summary card at the top of the Plan tab: Planned / Done / Skipped counts and a completion % bar (Done ÷ (Done + Skipped); Planned sessions excluded from the denominator)
- [x] **Skip notes** — on a Skipped card, add or edit a free-text reason (e.g. "knee pain"); note is shown on the card and cleared automatically on copy-from-last-week
- [x] **Copy from last week** — one-tap button clones all sessions from the previous week with dates shifted +7 days and skip notes stripped; returns a conflict error if the target week already has sessions
- [x] **Start session from plan** — "Start" button on today's Planned cards pre-fills the log form: strength opens `/log?type=strength&templateId=…`; cardio opens `/log?type=cardio&plannedSessionId=…` with all segments (distance, duration, pace) pre-filled; a three-way prompt appears if a draft already exists
- [x] **Reschedule** — modal shows the Mon–Sun days of the current week with past days disabled; moving the session updates its `planned_date`
- [x] **Swap / Edit** — Skipped cards show "Swap" (opens the plan form pre-filled so the user can change the session type or segments); Planned cards show "Edit"; inline delete with a Yes/No confirmation prompt
- [x] **AI Cardio Adapt modal** *(from Phase 11 backlog)* — "Adapt this session" button appears in the cardio log form when the logged activity type matches a today-planned cardio session; user describes a complaint; `POST /ai/adapt-cardio-session` sends the planned session structure + cardio history; suggestions rendered as markdown

### Technical notes

- Three new tables: `weekly_plans`, `planned_sessions`, `planned_cardio_segments`; `week_start` enforced as a Monday (400 otherwise); plan auto-created on first `GET`
- Activity type lives at session level (`planned_sessions.activity_type_id`), matching the logging model — not per segment
- `toLocalDateStr()` helper in `dateUtils.ts` replaces all `toISOString().split('T')[0]` calls throughout the app to prevent UTC date-shift for UTC+ users
- Cardio plan card titles auto-generated as "Run – 8 km" or "Run – 45 min" from aggregated segment distance / duration when no explicit title is set

### Definition of Done

A user can open the Plan tab, build a week's plan with strength and cardio sessions, navigate prev/next weeks, and see planned sessions flip to Done when a matching session is logged — or to Skipped when a day passes with no log. They can annotate skipped sessions with a reason, copy last week's plan in one tap, and — when logging a cardio session that matches today's plan — tap "Adapt this session" to get AI-powered modification suggestions. ✅ **Achieved.**

---

## ✅ Phase 12 — Analytics Fixes & Navigation Revamp

**Goal:** Fix broken analytics charts, reorganize the analytics UX, and clean up navigation before building on top of either.

### Deliverables

#### Analytics bug fixes
- [x] **Activity Type Split** — fix SQL; chart currently returns no data
- [x] **Walk Segments per Session** — fix SQL; all values currently zero
- [x] **Distance Progression** — fix SQL; no distance data shown

#### Analytics UX reorganization
- [x] **Consistency heatmap repositioned** — moved to directly below the all-time summary header (currently buried at the bottom)
- [x] **New overview charts** — sessions per week, total training time per week, total volume per week; visible by default
- [x] **Strength section layout** — Weekly Volume by Type + Weekly Exercises by Type visible by default; all other strength charts collapsed
- [x] **Cardio section** — collapsed by default

#### Navigation revamp
- [x] **Tab consolidation** — fewer top-level tabs, centered, clearer labels; resolve the "too many tabs" feedback

#### Profile
- [x] **API key simplification** — single provider selector + one key field; replaces the current separate Anthropic / OpenAI fields

#### Plan tab
- [x] **Plan vs. actual summary** — weekly card showing planned vs. logged totals: distance and time for cardio; exercises and volume for strength

### Definition of Done

A user can open Analytics and see correctly populated charts for activity split, walk segments, and distance progression. The analytics page is organized with the most actionable charts visible by default. Navigation tabs fit comfortably on mobile and are easy to read. The plan tab weekly card shows how logged volume compared to the plan.

---

## ✅ Phase 13 — Heart Rate Zones *(completed)*

**Goal:** Turn HR data into actionable zone-based insight. Users manually enter avg HR and time-in-zone data (copied from Apple Watch / Apple Health) per cardio session.

### Deliverables

- [x] **DB migration** — added `avg_hr_bpm`, `z1_seconds`–`z5_seconds` to `workout_sessions`; dropped the unused `cardio_segments.heart_rate_avg` column
- [x] **Cardio log form: HR input** — collapsible "Add HR data" section with avg HR field and five zone duration inputs (Z1–Z5 with BPM range labels); auto-expanded when editing a session with existing HR data; draft auto-save includes HR fields
- [x] **Session detail: HR zone distribution** — donut chart showing time-in-zone breakdown; only non-zero zones rendered as slices; tooltip shows zone label, BPM range, formatted duration, and %; avg HR shown as a stat; section hidden when no HR data present
- [x] **History list: avg HR badge** — heart icon + "{n} bpm" shown on cardio session rows where `avg_hr_bpm` is set; matches existing stat chip style
- [x] **Analytics: time-in-zone trends chart** — stacked bar chart (Minutes / % toggle) showing weekly zone breakdown over the last 12 weeks; SQL debug icon; backed by `GET /analytics/cardio/hr-zone-trends`
- [x] **Tests** — 5 session API tests + 3 analytics tests covering HR data persistence, list exposure, null handling, aggregation, and debug flag

### Definition of Done

A user can log a cardio session with HR data from Apple Watch, see a zone donut on session detail, find avg HR in the History list, and explore weekly time-in-zone trends in Analytics. ✅ **Achieved.**

---

## Phase 14 — Plan vs. Actual Deep Analytics

**Goal:** Make the gap (or match) between planned and completed training visible both per-session and as a rolling trend.

### Deliverables

- [ ] **Per-session comparison** — on a "Done" planned session card, show planned vs. actual side-by-side: distance/time for cardio; exercises, sets, reps, and total volume for strength
- [ ] **Plan tab weekly totals** — weekly summary card shows planned total volume/distance vs. actual logged totals with a delta
- [ ] **Analytics: Plan Adherence section** — rolling weekly chart of completion % and volume delta (planned vs. actual); helps spot weeks of under- or over-delivery over time

### Definition of Done

A user can tap a completed planned session and immediately see what they planned vs. what they actually did. The Analytics tab shows a multi-week view of how closely they've been following their plan.

---

## Phase 15 — Integrations: Import Pipeline

**Goal:** A user can import training data from Strava and Apple Health, review staged sessions before they're saved, and have richer health metrics (sleep, HRV, resting HR, body weight) available across the app.

### Phase 15a — Strava Import

- [ ] **OAuth flow** — connect Strava account from Profile; store OAuth tokens per user
- [ ] **Fetch & map activities** — pull recent Strava activities and map to Trainlytics cardio sessions (type, segments, distance, duration, pace, HR)
- [ ] **Import review queue** — staged sessions shown before committing; user accepts, discards, or lightly edits each; deduplication by date + duration prevents double-logging
- [ ] **Import status in Profile** — last synced timestamp; manual re-fetch button

### Phase 15b — Apple Health XML Import

- [ ] **XML file upload** — user exports from iPhone Settings → Health → Export All Health Data and uploads the zip/XML
- [ ] **Parser for all supported types** — workouts, steps, resting HR, HRV (SDNN), sleep, body weight, VO2 max, active energy burned
- [ ] **New backend tables** — daily health metrics: `body_metrics` (weight, resting HR, HRV, VO2 max, sleep duration/quality per date)
- [ ] **Import review queue** — same staged approval UI as Strava; user reviews before committing
- [ ] **Health section in Analytics** — new section showing: sleep duration trend, resting HR over time, HRV trend, body weight over time
- [ ] **AI context enrichment** — recent sleep, HRV, and resting HR included in AI prompts as readiness signals

### Technical notes

- Strava: standard OAuth 2.0 with activity scope; `GET /athlete/activities` endpoint
- Apple Health export is a zip containing `export.xml` (HealthKit records) and `workout-routes/` (GPX files); parser targets `HKRecord` and `HKWorkout` elements
- Import queue stored in a `pending_imports` table; rows deleted on accept or discard

### Definition of Done

A user can connect Strava and import recent runs with one click, reviewing each before saving. They can upload their Apple Health export and have workouts, body weight, sleep, and HRV data imported and visible in Analytics. AI prompts automatically include recent HRV and sleep when available.

---

## Phase 16 — Agentic AI Coach

**Goal:** The AI can propose concrete, targeted edits to the training plan — for both end-of-week review and in-week adjustments — and the user approves or dismisses each change before anything is saved.

### Deliverables

#### Week review
- [ ] **"Review week" trigger** — button at the top of the Plan tab; auto-prompted on Monday for the previous week
- [ ] **AI analysis** — analyzes planned vs. actual completion, wellbeing and RPE trends, fatigue signals from the week; proposes specific edits to next week's plan
- [ ] **Diff-style approval UI** — each proposed change is a card: "Move Thursday run → Saturday", "Remove Friday strength — low wellbeing trend"; user accepts or dismisses each individually, then commits all accepted changes at once

#### In-week plan adjustment
- [ ] **"Adjust plan" button** — on the current week view in the Plan tab
- [ ] **Free-text context input** — user describes their situation ("travelling Wed–Thu", "shoulder is sore", "want to add an extra run")
- [ ] **AI proposes edits** — specific changes to the remaining sessions in the current week
- [ ] **Same diff-style approval UI** — accept / dismiss per change, then commit

### Technical notes

- New endpoint: `POST /ai/review-week` — takes previous week summary + next week plan structure; returns a list of typed edit operations (`move_session`, `remove_session`, `add_session`, `adjust_volume`)
- New endpoint: `POST /ai/adjust-week` — takes current week plan + free-text constraint; returns same edit operation format
- Frontend applies accepted operations to the plan via existing plan mutation endpoints
- Edit operations are structured (not free text) so the frontend can render them as reversible diffs

### Definition of Done

A user can tap "Review week" after a hard week, see AI-proposed adjustments to next week's plan as individual accept/dismiss cards, and commit the ones that make sense. They can also describe a mid-week constraint and get targeted edits to the remaining days — without the AI making any changes until explicitly approved.

---

## Out of Scope (for now)

- Multi-user support (single account only)
- Native mobile app (mobile browser is the target)
- Garmin integrations
- Social features
