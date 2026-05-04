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
- [x] Two different env accounts can log in independently and see only their own data — *verified by `test_user_isolation` + `test_user_cannot_edit_other_users_exercise` + `test_cardio_type_user_isolation`*

---

## Exercise Library

- [x] Can create an exercise with a name — *verified by `test_create_exercise`*
- [x] Created exercises appear in the list immediately — *React Query invalidates `['exercises']` on every mutation*
- [x] Can edit an exercise name; the updated name appears in history for past sessions that referenced it — *verified by `test_update_exercise_name`; name lookup is live since sessions reference exercise ID*
- [x] Can delete an exercise (only if not referenced by any session, or soft-delete is handled gracefully) — *verified by `test_delete_exercise`; FK constraint handling deferred to Groups 5–6 when sessions are added*

---

## Cardio Activity Types

- [x] Can create, rename, and delete cardio activity types — *verified by `test_create_cardio_type`, `test_rename_cardio_type`, `test_delete_cardio_type`*
- [x] Deleted types that are referenced by sessions are handled without data loss — *`activity_type_id` FK uses `SET NULL` (migration 0003)*

---

## Cardio Logging

- [x] Can log a cardio session with one segment (e.g. a 30-minute run) — *verified by `test_create_cardio_session_single_segment`*
- [x] Can log a cardio session with multiple segments (e.g. 10-min walk → 20-min run → 5-min walk) — *verified by `test_create_cardio_session`*
- [x] Segment fields (duration, distance, pace, heart rate) are all optional except duration — *verified by `test_create_cardio_session_single_segment`*
- [x] Session appears in history immediately after logging — *React Query `['sessions', ...]` is invalidated; `HistoryPage` refetches on mount*
- [x] Session detail view shows all segments in order with their metrics — *`CardioSessionDetailPage` renders segments from `GET /sessions/{id}`*
- [x] Can edit a session (change date, notes, add/remove/reorder segments) — *verified by `test_patch_cardio_session`; `CardioSessionDetailPage` edit form*
- [x] Can delete a session; it disappears from history — *verified by `test_delete_cardio_session`; delete button in detail view navigates home*

---

## Strength Logging

- [x] Can log a strength session with one exercise and multiple sets — *verified by `test_create_strength_session`*
- [x] Can log a strength session with multiple exercises, each with different numbers of sets — *verified by `test_create_strength_session_multiple_exercises`*
- [x] Exercise picker shows the user's library (not a global catalog) — *`LogStrengthPage` fetches `/exercises` for the current user; invalid exercise IDs rejected with 400*
- [x] Session appears in history immediately after logging — *React Query `['sessions', ...]` is invalidated; `HistoryPage` refetches on mount*
- [x] Session detail view shows all exercises and their sets with reps and weight — *`StrengthSessionDetailPage` renders exercises + sets from `GET /sessions/{id}`*
- [x] Can edit a session (add/remove exercises and sets, change weights/reps) — *verified by `test_patch_strength_session`; `StrengthSessionDetailPage` edit form*
- [x] Can delete a session — *verified by `test_delete_strength_session`; delete button navigates home*

---

## Workout History

- [x] History shows both cardio and strength sessions in reverse chronological order — *`GET /sessions` orders by date desc; verified by `test_list_sessions_reverse_chronological`*
- [x] Filtering by type (cardio / strength) returns only matching sessions — *verified by `test_list_sessions_filter_by_type`*
- [x] Filtering by date range returns only sessions within that range — *verified by `test_list_sessions_filter_by_date_range`*
- [x] Each row links to the correct session detail view — *`HistoryPage` wraps each row in `<Link to="/sessions/{id}">`*

---

## Responsive / Mobile

- [ ] Login page, log forms, history, and detail views are usable on a 390px-wide screen (iPhone-sized)
- [ ] No horizontal scroll on mobile for core pages
- [ ] Add-segment and add-exercise buttons are reachable without zooming

---

## Automated Tests

- [x] Backend: pytest suite covers auth endpoints (login, refresh, logout, 401 on invalid token) — *9 tests passing*
- [x] Backend: pytest covers CRUD for exercises, activity types, cardio sessions, strength sessions, and history listing — *exercises: 11 tests, cardio types: 9 tests, sessions: 23 tests = 43+ total passing*
- [x] Backend: a test confirms users cannot access each other's data — *`test_user_isolation`, `test_user_cannot_edit_other_users_exercise`, `test_cardio_type_user_isolation`, `test_cardio_type_cannot_edit_other_users`, `test_list_sessions_user_isolation` all passing*
- [x] Frontend: Vitest covers the login form (validation, error display) — *4 tests passing*
