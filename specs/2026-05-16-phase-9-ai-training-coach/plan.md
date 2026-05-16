# Phase 9 — AI Training Coach: Plan

## Task Groups

---

### Group 1 — DB Migration & Crypto Service ✅

1.1 ✅ Add `user_settings` table via Alembic migration: columns `username` (PK), `display_name` (varchar, nullable), `birth_year` (integer, nullable), `experience_level` (varchar, nullable), `goals` (jsonb, nullable), `injury_notes` (text, nullable), `coach_notes` (text, nullable), `anthropic_api_key_encrypted` (text, nullable), `openai_api_key_encrypted` (text, nullable), `ai_provider` (varchar, nullable)  
1.2 ✅ Add `ai_request_logs` table via same (or separate) Alembic migration: columns `id` (PK autoincrement), `username` (varchar), `endpoint` (varchar), `provider` (varchar), `model` (varchar), `prompt` (text), `response` (text, nullable), `input_tokens` (integer, nullable), `output_tokens` (integer, nullable), `duration_ms` (integer), `error` (text, nullable), `created_at` (timestamptz, server default now())  
1.3 ✅ Create `app/services/crypto.py`: Fernet key derived from `SECRET_KEY` via PBKDF2-HMAC-SHA256 with fixed app salt; expose `encrypt(plaintext: str) -> str` and `decrypt(ciphertext: str) -> str`  
1.4 ✅ Apply migrations locally; verify with `alembic upgrade head` and `\d user_settings`, `\d ai_request_logs`

---

### Group 2 — Backend: Profile Endpoints ✅

2.1 ✅ Add `UserSettings` SQLAlchemy model in `app/models/user_settings.py`  
2.2 ✅ Add Pydantic schemas in `app/schemas/user_settings.py`: define `GoalItem(text: str, priority: Literal["high", "medium", "low"])`; `UserSettingsOut` includes `goals: list[GoalItem]`; `UserSettingsPatch` accepts `goals: list[GoalItem] | None` (full array replacement)  
2.3 ✅ Add `app/api/profile.py` with:
  - `GET /profile` — fetch row (or return defaults if no row); never include raw keys; return `has_anthropic_key` and `has_openai_key` booleans
  - `PATCH /profile` — upsert row; encrypt each key via `crypto.py` before storing; passing `null` for a key field clears it  
2.4 ✅ Register `/profile` router in `app/main.py`  
2.5 ✅ Write pytest tests in `tests/test_profile.py`: get with no row, patch display name, patch birth year, patch experience level, patch goals list (add item with priority, remove item, verify invalid priority rejected), patch injury notes, patch coach notes, patch Anthropic key, patch OpenAI key, verify neither key is returned, clear each key independently, set `ai_provider`

---

### Group 3 — Backend: AI Service & Weekly Insights

3.1 Add `anthropic` and `openai` to backend dependencies (`pyproject.toml`)  
3.2 Create `app/services/ai_service.py`:
  - `get_active_provider(username) -> tuple[str, str] | None` — returns `(provider, decrypted_key)` based on `ai_provider` setting and which keys are set; returns `None` if no key configured  
  - `build_athlete_context_block(username) -> str` — assembles the profile context block (experience, age derived from birth year, goals, injury notes, coach notes); omits lines for unset fields  
  - `call_ai(prompt: str, username: str, endpoint: str) -> str` — prepends athlete context block, dispatches to Anthropic (Claude Sonnet, with prompt caching) or OpenAI (GPT-4o) based on active provider; measures wall-clock duration; writes a row to `ai_request_logs` (prompt, response, tokens, duration, error if any) regardless of success or failure; log write errors are silently swallowed and never propagate to the caller  
  - `compact_sets(sets: list) -> str` — collapses consecutive sets with identical reps+weight into `N×reps@weight` notation; non-uniform sets listed individually  
  - `compact_cardio_segments(segments: list) -> str` — collapses consecutive identical segments into `N×dist@pace` notation  
  - `compact_session_summary(session) -> str` — builds a full compact plain-text summary of one session using the above helpers; used by all AI prompt builders  
  - `build_weekly_history_prompt(username) -> str` — assemble current week + previous 5 weeks into structured text using `compact_session_summary`  
  - `call_weekly_insights(username) -> str` — wrap history in provider-appropriate call via `call_ai`  
  - `build_session_snapshot_prompt(session_snapshot, user_message, username) -> str` — fetch recent 4 weeks (compacted) + available replacements per exercise  
  - `call_adapt_session(session_snapshot, user_message, username) -> str` — call via `call_ai`  
3.3 Create `app/api/ai.py`:
  - `POST /ai/weekly-insights` — call `ai_service.call_weekly_insights`; 402 if no API key configured  
  - `POST /ai/adapt-session` — body `{ session_snapshot, user_message }`; call `ai_service.call_adapt_session`; 402 if no API key configured  
3.4 Register `/ai` router in `app/main.py`

---

### Group 4 — Frontend: Profile Page

4.1 Create `src/pages/ProfilePage.tsx`:
  - Fetch `GET /profile` on mount  
  - **About section**: display name (text input), birth year (number input), experience level (Beginner / Intermediate / Advanced segmented control)
  - **Training goals section**: each goal has a text input and a priority selector (High / Medium / Low); "Add goal" appends a new item defaulting to Medium priority; each item has a remove (✕) button; list is displayed sorted by priority (high → medium → low); saves full array via `PATCH /profile`
  - **Injury / limitation notes**: textarea, saves on blur or explicit Save button
  - **AI coach notes**: textarea, saves on blur or explicit Save button
  - **AI Provider section**: two key fields (Anthropic, OpenAI), each with masked input, toggle reveal, save, and remove; provider toggle shown only when both keys are set  
  - Each key: on save calls `PATCH /profile`, clears input, shows "Configured ✓"; remove calls `PATCH /profile` with `null`
  - Sections are visually separated (cards or dividers); page must be scrollable and usable on mobile  
4.2 Add `/profile` route in `App.tsx`  
4.3 Add "Profile" link to nav bar

---

### Group 5 — Frontend: Weekly Insights Panel

5.1 Create `src/components/WeeklyInsightsCard.tsx`:
  - If `has_api_key` false: render inline prompt with link to `/profile`  
  - If `has_api_key` true: render "Analyse this week" button  
  - On click: call `POST /ai/weekly-insights`; show spinner; on success render plain-text result in scrollable card body  
  - Error state: show error message with retry option  
5.2 Insert `<WeeklyInsightsCard />` in the History screen below the weekly summary card and above the training trends chart  
5.3 The `has_api_key` value is fetched once (from existing profile query or a dedicated lightweight call) and passed as a prop

---

### Group 6 — Frontend: Adaptive Session Helper

6.1 Create `src/components/AdaptSessionModal.tsx`:
  - A modal with a `<textarea>` for the user's free-text description  
  - "Get suggestions" button triggers `POST /ai/adapt-session` with `{ session_snapshot, user_message }`  
  - Spinner while loading; plain-text suggestions rendered on success  
  - Close button dismisses modal  
6.2 Add "Adapt this session" button near the top of the strength log form in `LogWorkoutPage.tsx` (or equivalent component); only visible when type is Strength  
6.3 Build `session_snapshot` object from current form state before opening modal: `{ template_name?, exercises: [{ exercise_id, exercise_name, replacements: [...], sets: [{ reps, weight_kg }] }] }`  
6.4 If `has_api_key` is false: button is replaced by the inline "configure key" prompt

---

### Group 7 — Tests & Polish

7.1 Backend: add `tests/test_ai.py` — mock Anthropic/OpenAI SDKs; test weekly-insights 402 when no key; test adapt-session 402; test happy-path returns `analysis`/`suggestions` string; test that a successful call writes a row to `ai_request_logs` with correct endpoint, provider, model, and non-null response; test that a failed AI call (SDK raises exception) still writes a log row with the error field set and does not re-raise to the caller  
7.2 Backend: unit tests for `compact_sets` and `compact_cardio_segments` in `tests/test_ai.py`: all-same sets → `N×reps@weight`; mixed sets → individual listing with grouped runs; single set → no prefix; empty list → empty string  
7.3 Frontend: add Vitest tests for `WeeklyInsightsCard` (no-key state, loading state, result state) and `AdaptSessionModal` (renders, submits, shows result)  
7.4 Manual validation pass per `validation.md`  
7.5 Update `CHANGELOG.md` with Phase 9 entry
