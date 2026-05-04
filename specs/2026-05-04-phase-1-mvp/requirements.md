# Phase 1 — MVP Requirements

## Scope

Deliver a working, secured fitness logging app. A user can log in, manage their personal libraries (exercises, cardio activity types), log any workout session in detail, and browse their history.

## Decisions

### Auth
- No registration UI. Accounts are declared in environment variables (e.g. `USERS=marie:hashedpassword,alice:hashedpassword`).
- Multiple accounts are supported — each user sees only their own data.
- JWT access token (short-lived, stored in memory) + refresh token (HTTP-only cookie, longer-lived).
- All API routes require a valid token. Frontend redirects to `/login` on 401.
- Passwords are stored as bcrypt hashes in the env config.

### Exercise Library
- Users build their own exercise library before or during logging.
- Each exercise has a name and optional notes (e.g. "focus on form").
- Exercises are per-user — no shared global catalog.
- Exercises are referenced by strength sessions; renaming an exercise reflects everywhere.

### Cardio Activity Types
- Users manage their own list of activity types (e.g. "Run", "Trail Run", "Cycling", "Swim").
- Each type has a name only — no fixed schema per type; all cardio sessions share the same metric fields.
- Types are per-user.

### Cardio Sessions
- A session has: activity type, date, total duration, notes.
- A session is composed of one or more **segments**. Segments are sequential and ordered.
- Each segment has: duration, distance, pace (computed or manual), heart rate (avg).
- Total duration on the session is the sum of segment durations (or can be overridden for breaks/warmup not worth logging individually).

### Strength Sessions
- A session has: date, notes.
- A session contains one or more **exercises** (chosen from the user's library).
- Each exercise entry has one or more **sets**, each with: reps, weight (kg or lb — unit is a user preference), optional notes.

### Workout History
- Lists all sessions (cardio + strength) in reverse chronological order.
- Filterable by: activity type / session type (cardio/strength), date range.
- Each row shows: date, type, key summary metric (duration for cardio, total sets for strength).

### Mobile
- Responsive web app. No PWA, no offline. Works in mobile browser with wifi or mobile data.
- Layout must be usable on a phone screen for logging at the gym.

## Out of Scope for Phase 1

- Workout templates (Phase 2)
- Weekly planning (Phase 4)
- Analytics and charts (Phase 5)
- Export (Phase 5)
- Unit conversion (kg/lb) — pick one and stick with it for now
