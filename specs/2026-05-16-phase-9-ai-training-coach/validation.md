# Phase 9 — AI Training Coach: Validation

## Definition of Done

A user can open their profile, enter their Anthropic API key, then: tap "Analyse this week" on the History screen to get an AI comparison against the previous 5 weeks, and — when opening any strength log form — describe a physical complaint and receive specific modification suggestions without leaving Trainlytics.

---

## Acceptance Criteria by Deliverable

### User Profile Page

- [ ] `/profile` route is accessible and linked from the nav bar
- [ ] Display name can be set and updated; change persists on page reload
- [ ] Birth year can be set; age is not stored — verify `birth_year` column in `user_settings`, not an `age` column
- [ ] Experience level selector saves and persists; valid values are `beginner`, `intermediate`, `advanced`
- [ ] Training goals: adding a goal requires both text and a priority (High / Medium / Low); new goals default to Medium; removing a goal deletes it; list is displayed sorted high → medium → low; stored as JSONB array of `{ text, priority }` objects; confirmed via psql
- [ ] Goals with an invalid priority value are rejected by the backend (422)
- [ ] Injury / limitation notes: saves and persists on reload
- [ ] AI coach notes: saves and persists on reload
- [ ] Anthropic key field: masked by default, toggle reveals; saving shows "Configured ✓"; raw key never visible again
- [ ] OpenAI key field: same behaviour as Anthropic key field
- [ ] `GET /profile` response includes `birth_year`, `experience_level`, `goals`, `injury_notes`, `coach_notes`, `has_anthropic_key`, `has_openai_key`; neither raw key appears
- [ ] "Remove" clears the respective key; `GET /profile` returns `false` for that key; AI features show the configure prompt if no key remains
- [ ] Provider toggle is visible only when both keys are configured; selecting a provider persists via `PATCH /profile`
- [ ] When only one key is set, that provider is used automatically with no toggle shown
- [ ] Profile page is scrollable and renders cleanly on mobile (iPhone viewport)

### AI Prompt Context

- [ ] With experience level, goals, injury notes, and coach notes all set: the AI prompt (inspectable via backend log or test) includes a well-formed athlete context block before the training history
- [ ] Fields omitted from the block when not set (no blank lines for empty fields)
- [ ] Age is rendered as a computed integer (current year − birth year), not the raw birth year

### API Key Encryption

- [ ] Both `anthropic_api_key_encrypted` and `openai_api_key_encrypted` store ciphertext — verify with:
  ```sql
  SELECT username, left(anthropic_api_key_encrypted, 10), left(openai_api_key_encrypted, 10) FROM user_settings;
  ```
- [ ] Decryption in `crypto.py` round-trips correctly for both keys (unit test)
- [ ] Changing `SECRET_KEY` causes both keys to return `has_*_key: false` gracefully (no crash)

### Weekly Insights Panel

- [ ] "AI Insights" card visible on the History screen, positioned below the weekly summary and above the trends chart
- [ ] When no API key is configured: "Analyse this week" button is replaced by an inline prompt linking to `/profile`
- [ ] When key is configured: button is present and triggers `POST /ai/weekly-insights`
- [ ] Spinner shown while the request is in flight
- [ ] Response text is rendered in the card body; scrollable if long
- [ ] Error state shows a user-friendly message and a retry button
- [ ] `POST /ai/weekly-insights` returns 402 when no key is stored

### Adaptive Session Helper

- [ ] "Adapt this session" button visible in the strength log form (both template and ad-hoc paths)
- [ ] Button is absent from the cardio log form
- [ ] When no API key: button replaced by inline configure prompt
- [ ] Tapping the button opens the adapt modal
- [ ] User can type a free-text description; "Get suggestions" is disabled while empty
- [ ] Spinner shown while request is in flight
- [ ] Suggestions rendered as plain text in the modal
- [ ] Closing the modal does not alter the form state
- [ ] `POST /ai/adapt-session` returns 402 when no key is stored
- [ ] The `session_snapshot` sent to the backend includes current exercises, sets, reps, and weights from the form

### Backend Tests

- [ ] `tests/test_profile.py` passes: get (no row), patch display name, patch Anthropic key, patch OpenAI key, neither key returned, clear each key independently
- [ ] `tests/test_ai.py` passes with mocked AI SDKs: 402 paths, happy-path responses
- [ ] `test_ai.py`: successful call writes a row to `ai_request_logs` with correct `endpoint`, `provider`, `model`, non-null `response`, and non-null `input_tokens`/`output_tokens`
- [ ] `test_ai.py`: failed AI call (SDK raises) writes a row with `error` set and `response` null — and the exception is **not** re-raised to the HTTP handler
- [ ] `compact_sets` unit tests pass:
  - 5 identical sets (5 reps @ 100 kg) → `5×5@100kg`
  - Mixed sets (10@60kg, 5@90kg, 5@90kg, 4@90kg) → `10@60kg, 2×5@90kg, 4@90kg`
  - Single set → no repetition prefix (e.g. `5@100kg`)
  - Empty list → empty string
- [ ] `compact_cardio_segments` unit tests pass for analogous cases

### AI Request Logging

- [ ] `ai_request_logs` table exists with all expected columns (confirmed via `\d ai_request_logs`)
- [ ] After triggering "Analyse this week": a row exists in `ai_request_logs` with the correct `endpoint`, `provider`, `model`, non-empty `prompt`, non-empty `response`, non-null token counts, and a reasonable `duration_ms`
- [ ] The `prompt` column contains the full assembled text including the athlete context block and compacted training history — sufficient to reproduce the call independently
- [ ] After triggering "Adapt this session": a separate row is written with `endpoint = "adapt-session"`
- [ ] A simulated SDK failure (e.g. bad key) writes a row with `error` populated and `response` null; the user sees an error message, not a 500

---

## DB Validation

Run after migration:

```sql
-- Confirm user_settings table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_settings';

-- Confirm key is stored encrypted (not plaintext)
SELECT username, length(anthropic_api_key_encrypted), left(anthropic_api_key_encrypted, 10)
FROM user_settings;
```

---

## Regression Checks

- [ ] All existing session creation and editing flows still work unchanged
- [ ] History screen weekly summary and training trends chart still render correctly with the new AI Insights card inserted between them
- [ ] Phase 8 wellbeing/RPE fields still present in log forms and detail views
- [ ] Settings / Manage Exercises replacements still function correctly
- [ ] Nav bar renders cleanly on mobile with the new "Profile" link added

---

## Manual Validation — Local Deployment

These steps assume a running local environment (`docker compose up --build` from the repo root, with `alembic upgrade head` applied).

### Setup

1. Start the app: `docker compose up --build` from repo root
2. Apply migrations: `docker compose exec backend uv run alembic upgrade head`
3. Open [http://localhost:5173](http://localhost:5173) and log in

### Profile & API Keys

1. Click **Profile** in the nav bar — confirm the page loads at `/profile`
2. Set display name, birth year, and experience level — reload and confirm all three persist
3. Add two training goals with different priorities (e.g. *"Run a sub-25min 5K"* → High, *"Improve mobility"* → Medium) — confirm both appear in the correct sorted order; remove one and confirm it disappears on reload
4. Enter injury notes (e.g. *"bad left knee"*) and AI coach notes — confirm both persist on reload
5. Enter your **Anthropic API key** and click Save — confirm the field clears and shows "Configured ✓"
6. Enter your **OpenAI API key** and click Save — confirm the same behaviour; confirm the **provider toggle** now appears
7. Open psql: `docker compose exec db psql -U postgres trainlytics` and run:
   ```sql
   SELECT username, birth_year, experience_level, goals,
          left(anthropic_api_key_encrypted, 20), left(openai_api_key_encrypted, 20)
   FROM user_settings;
   ```
   Confirm `goals` is a JSON array of `{ text, priority }` objects, `birth_year` is an integer, and both key columns contain ciphertext
8. Switch the provider toggle — confirm it persists on reload
9. Trigger an AI call (e.g. "Analyse this week") and check the backend logs or a test fixture to confirm the athlete context block is present in the prompt and includes the goals and injury notes you entered
10. Remove the Anthropic key — confirm the toggle disappears and OpenAI is used automatically
11. Remove the OpenAI key too — confirm AI features show the "Add an API key" prompt

### Weekly Insights

1. Make sure you have at least one logged session in the current or recent weeks
2. Navigate to **History**
3. Confirm the "AI Insights" card is visible below the weekly summary
4. With no API key set: confirm the button is replaced by the configure prompt; click the link and confirm it goes to `/profile`
5. Set the API key again, return to History
6. Click **Analyse this week** — confirm a spinner appears then a plain-text analysis is rendered in the card

### Adaptive Session Helper

1. Navigate to **Log** and select **Strength**
2. Confirm the **"Adapt this session"** button is visible near the top of the form
3. Add at least one exercise to the form
4. Click **Adapt this session** — confirm the modal opens
5. Type a description (e.g. *"My lower back is sore today"*) and click **Get suggestions**
6. Confirm a spinner appears then suggestions are rendered as plain text
7. Click **Close** — confirm the form is unchanged
8. Switch to **Cardio** — confirm the adapt button is **not** present

### Regression Smoke Test

1. Log a new strength session from a template — confirm it saves correctly with wellbeing/RPE
2. Log a new cardio session — confirm it saves correctly
3. Open History — confirm the weekly summary card and 12-week trends chart still render correctly alongside the new AI Insights card
4. Open Settings / Manage Exercises — confirm replacements still work
