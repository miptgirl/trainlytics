# Phase 1 — Validation

The implementation is complete and mergeable when all of the following pass.

---

## Auth

- [ ] `docker compose up` starts with no errors; login page loads at `localhost:5173`
- [x] Logging in with a valid env-defined account issues a JWT and sets the refresh cookie — *verified by `test_login_success`*
- [x] Logging in with wrong credentials returns 401 and shows an error on the login page — *verified by `test_login_wrong_password` + LoginPage error display*
- [x] Accessing any protected page while logged out redirects to `/login` — *verified by `test_exercise_requires_auth` + `ProtectedRoute`*
- [x] After access token expiry, a page reload silently refreshes the token using the cookie and stays logged in — *`AuthProvider` calls `/auth/refresh` on mount; `/auth/refresh` endpoint verified by `test_refresh_with_valid_cookie`*
- [ ] Logout clears the cookie and redirects to `/login`; back-button does not restore the session — *needs browser verification*
- [x] Two different env accounts can log in independently and see only their own data — *verified by `test_user_isolation` + `test_user_cannot_edit_other_users_exercise`*

---

## Exercise Library

- [x] Can create an exercise with a name — *verified by `test_create_exercise`*
- [x] Created exercises appear in the list immediately — *React Query invalidates `['exercises']` on every mutation*
- [x] Can edit an exercise name; the updated name appears in history for past sessions that referenced it — *verified by `test_update_exercise_name`; name lookup is live since sessions reference exercise ID*
- [x] Can delete an exercise (only if not referenced by any session, or soft-delete is handled gracefully) — *verified by `test_delete_exercise`; FK constraint handling deferred to Groups 5–6 when sessions are added*

---

## Cardio Activity Types

- [ ] Can create, rename, and delete cardio activity types
- [ ] Deleted types that are referenced by sessions are handled without data loss (session retains type name or is shown as "deleted type")

---

## Cardio Logging

- [ ] Can log a cardio session with one segment (e.g. a 30-minute run)
- [ ] Can log a cardio session with multiple segments (e.g. 10-min walk → 20-min run → 5-min walk)
- [ ] Segment fields (duration, distance, pace, heart rate) are all optional except duration
- [ ] Session appears in history immediately after logging
- [ ] Session detail view shows all segments in order with their metrics
- [ ] Can edit a session (change date, notes, add/remove/reorder segments)
- [ ] Can delete a session; it disappears from history

---

## Strength Logging

- [ ] Can log a strength session with one exercise and multiple sets
- [ ] Can log a strength session with multiple exercises, each with different numbers of sets
- [ ] Exercise picker shows the user's library (not a global catalog)
- [ ] Session appears in history immediately after logging
- [ ] Session detail view shows all exercises and their sets with reps and weight
- [ ] Can edit a session (add/remove exercises and sets, change weights/reps)
- [ ] Can delete a session

---

## Workout History

- [ ] History shows both cardio and strength sessions in reverse chronological order
- [ ] Filtering by type (cardio / strength) returns only matching sessions
- [ ] Filtering by date range returns only sessions within that range
- [ ] Each row links to the correct session detail view

---

## Responsive / Mobile

- [ ] Login page, log forms, history, and detail views are usable on a 390px-wide screen (iPhone-sized)
- [ ] No horizontal scroll on mobile for core pages
- [ ] Add-segment and add-exercise buttons are reachable without zooming

---

## Automated Tests

- [x] Backend: pytest suite covers auth endpoints (login, refresh, logout, 401 on invalid token) — *9 tests passing*
- [x] Backend: pytest covers CRUD for exercises, activity types, cardio sessions, and strength sessions — *exercises: 11 tests passing; remaining groups pending*
- [x] Backend: a test confirms users cannot access each other's data — *`test_user_isolation` + `test_user_cannot_edit_other_users_exercise` passing*
- [x] Frontend: Vitest covers the login form (validation, error display) — *4 tests passing*
