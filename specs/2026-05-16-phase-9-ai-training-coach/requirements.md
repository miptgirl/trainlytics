# Phase 9 — AI Training Coach: Requirements

## Goal

The app uses an LLM to analyze the last week of training and help the user adapt a planned session when something feels off — exercises to swap, volume to cut, movements to skip — without leaving Trainlytics. A user profile page provides a home for per-user settings including the AI API key.

---

## Scope

### 1. User Profile Page

A `/profile` route accessible from the nav bar. Persists per-user preferences in a new `user_settings` table keyed by username.

**Initial fields:**
- Display name (free text, optional)
- Date of birth — year only (integer, optional); used to compute age at prompt time for context; never shown publicly
- Experience level — `beginner` / `intermediate` / `advanced` (single select, optional)
- Training goals — ordered list of items, each with a **text** (free text) and a **priority** (`high` / `medium` / `low`); add/remove individual goals; stored as a JSONB array of objects `[{ "text": "...", "priority": "high" }, ...]`; displayed sorted by priority (high → medium → low) in the AI prompt
- Injury / limitation notes — free-text area (e.g. *"bad left knee"*, *"lower back issues"*); represents permanent or ongoing constraints, distinct from per-session wellbeing; included in every AI prompt automatically when set
- AI coach notes — free-text catch-all; anything the user always wants the AI to know that doesn't fit elsewhere (e.g. *"I train at 6am before work"*, *"I prefer compound movements"*)
- Anthropic API key (sensitive — see key storage below)
- OpenAI API key (sensitive — same storage approach)
- Active AI provider selection: **Anthropic** or **OpenAI** (radio/toggle; defaults to Anthropic if both are set)

**Backend:**
- `GET /profile` — returns `{ display_name, birth_year, experience_level, goals, injury_notes, coach_notes, has_anthropic_key, has_openai_key, ai_provider }`. Raw keys are **never returned**.
- `PATCH /profile` — accepts `{ display_name?, birth_year?, experience_level?, goals?, injury_notes?, coach_notes?, anthropic_api_key?, openai_api_key?, ai_provider? }`. Passing `null` for either key field clears it.

**DB table — `user_settings`:**

| Column | Type | Notes |
|---|---|---|
| `username` | varchar PK | matches the authenticated user |
| `display_name` | varchar, nullable | |
| `birth_year` | integer, nullable | year only; age computed at call time |
| `experience_level` | varchar, nullable | `"beginner"`, `"intermediate"`, or `"advanced"` |
| `goals` | jsonb, nullable | array of `{ text: string, priority: "high" \| "medium" \| "low" }` |
| `injury_notes` | text, nullable | permanent/ongoing constraints |
| `coach_notes` | text, nullable | free-text AI context catch-all |
| `anthropic_api_key_encrypted` | text, nullable | Fernet-encrypted |
| `openai_api_key_encrypted` | text, nullable | Fernet-encrypted |
| `ai_provider` | varchar, nullable | `"anthropic"` or `"openai"`; defaults to `"anthropic"` at call time if null |

Row is upserted on `PATCH /profile`. Created lazily — no row means no preferences set.

**Key storage:** Raw API keys are encrypted with **Fernet** (from `cryptography` library) using a 32-byte key derived from `SECRET_KEY` via PBKDF2-HMAC-SHA256 with a fixed application salt. Encryption/decryption lives in `app/services/crypto.py`. Keys are never logged or returned to the frontend after saving.

**Key decisions:**
- Weight unit is locked to **kg** throughout — no unit preference stored or converted. Closes the Phase 2 backlog item by explicit decision (not by implementing lb support).

---

### 2. API Key Configuration (Anthropic & OpenAI)

The profile page has an **"AI Provider"** section with two key fields — one for Anthropic, one for OpenAI — and a provider selector.

**Each key field:**
- Password-type input (masked by default, toggle to reveal)
- "Save" button that calls `PATCH /profile` then clears the input
- After saving, shows "Configured ✓" (green) with a "Remove" link
- Not-configured state shown in grey

**Provider selector:** A toggle/radio visible only when both keys are set — lets the user choose which provider is used for all AI calls. When only one key is configured, that provider is used automatically with no toggle shown.

**`ai_service.py` abstraction:** A single `call_ai(prompt, username)` function resolves the active provider and key, then dispatches to either the Anthropic SDK (`anthropic`) or OpenAI SDK (`openai`). Both use a capable mid-tier model: **Claude Sonnet** for Anthropic, **GPT-4o** for OpenAI.

All AI feature surfaces show an inline prompt — *"Add an API key in Profile to enable this feature"* — when neither key is set.

---

### AI Prompt Context Block

Every AI call prepends a **user context block** assembled from the profile fields. This block is included before the training history in all prompts so the model always has the athlete's background:

```
Athlete profile:
- Experience: intermediate
- Age: 34
- Goals:
    [high] Run a sub-25min 5K
    [high] Increase squat to 100 kg
    [medium] Improve mobility
- Ongoing limitations: bad left knee
- Notes: I train at 6am before work
```

Fields are omitted from the block when not set — a profile with only goals and no injury notes would only include the goals line. The context block is included in the cached portion of Anthropic prompts where possible.

---

### 3. Weekly Insights Panel

An **"AI Insights"** card added to the existing **History screen**, placed below the weekly summary card and above the training trends chart.

**UI:**
- Card with a header "AI Insights" and an "Analyse this week" button
- On press: shows a loading spinner; on success renders the returned plain-text analysis in a scrollable card body
- If no API key is configured: button is replaced by the "configure your key" inline prompt
- The result persists in React state for the session (not cached to `localStorage`)

**Backend — `POST /ai/weekly-insights`:**
- Assembles training data for the current Mon–Sun week and the previous 5 complete weeks
- Constructs a structured prompt including: session dates, types, volumes, exercises, sets×reps×weights (strength), distances and durations (cardio), and wellbeing/RPE values from Phase 8 where present
- Strength sets are **compacted before serialisation** (see *Training summary compaction* below) to minimise token usage
- The 5-week history block is sent with **Anthropic prompt caching** (`cache_control: { type: "ephemeral" }`) to minimise token cost on repeat calls within the same day
- Model: **Claude Sonnet** (claude-sonnet-4-5 or latest available at implementation time)
- Returns `{ analysis: string }` — plain text, no structured fields

**Prompt guidance (server-side):**
Instruct the model to surface: total volume change week-over-week, pace or strength progression, any PRs, wellbeing/RPE patterns, and any imbalance observations (e.g. all push, no pull). Keep response concise — 150–250 words.

---

### Training Summary Compaction

All places where session history is serialised into an AI prompt — weekly insights, adapt-session context, and any future AI calls — use a shared `compact_session_summary` utility in `app/services/ai_service.py`.

**Set compaction rule:** Consecutive sets with identical `reps` and `weight_kg` are collapsed into a `N×reps@weight` notation. Non-uniform sets are listed individually.

**Examples:**

```
# Before compaction (5 sets, all 5 reps @ 100 kg):
Squat: 5 reps @ 100kg, 5 reps @ 100kg, 5 reps @ 100kg, 5 reps @ 100kg, 5 reps @ 100kg

# After compaction:
Squat: 5×5@100kg

# Mixed sets (warm-up + working sets):
Bench Press: 10@60kg, 3×5@90kg, 4@90kg
# (two working sets of 5 are grouped; the last partial set is listed separately)
```

**Cardio segments** with identical distance, duration, and pace are similarly collapsed:
```
# 3 identical 1km intervals:
Run intervals: 3×1km in 4:30/km
```

The compacted format is used **only** in AI prompts — all data is still stored and retrieved in full normalised form in the DB. The function is pure (input → string) and unit-testable independently.

**Expected token reduction:** For a typical strength session of 5 exercises × 4 sets at a consistent weight, compaction reduces the set representation from ~60 tokens to ~15 tokens — roughly a 75% reduction for the sets block.

---

### 4. Adaptive Session Helper (Strength only)

When opening the **strength log form** (with or without a template loaded), an **"Adapt this session"** button appears near the top of the form.

**Flow:**
1. User taps "Adapt this session"
2. A modal/bottom sheet opens with a free-text field: *"Describe how you're feeling or any constraints (e.g. 'my calves hurt', 'very tired today')"* and a "Get suggestions" button
3. On submit: spinner shown; the AI response is displayed in the same modal as plain text
4. The modal has a "Close" button; it does **not** automatically apply any changes — the user reads the suggestions and acts manually

**Backend — `POST /ai/adapt-session`:**
- Request body: `{ session_snapshot: object, user_message: string }`
  - `session_snapshot` — the current in-progress session state as assembled on the frontend (exercises, sets, reps, weights, template name if any)
  - `user_message` — the user's free-text description
- The backend fetches the user's recent training history (last 4 weeks) to provide context
- Uses the replacement exercises defined in Phase 8 — the prompt tells the model which replacements are available for each exercise in the session
- Returns `{ suggestions: string }` — plain text with specific actionable modifications

**Scope note:** Adaptive session helper is **strength-only** in this phase. Extending to cardio sessions is deferred to after the planning layer (Phase 10) is in place. See roadmap backlog.

---

### 5. AI Request Logging

Every AI call — regardless of endpoint or provider — is recorded to an `ai_request_logs` table in the database. This is the primary debugging surface for inspecting prompt quality, response content, token usage, and latency.

**DB table — `ai_request_logs`:**

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK, autoincrement | |
| `username` | varchar | authenticated user |
| `endpoint` | varchar | `"weekly-insights"` or `"adapt-session"` |
| `provider` | varchar | `"anthropic"` or `"openai"` |
| `model` | varchar | exact model string used (e.g. `"claude-sonnet-4-5"`, `"gpt-4o"`) |
| `prompt` | text | full prompt sent to the model, including athlete context block and history |
| `response` | text | raw text response from the model |
| `input_tokens` | integer, nullable | as reported by the provider SDK |
| `output_tokens` | integer, nullable | as reported by the provider SDK |
| `duration_ms` | integer | wall-clock time of the API call in milliseconds |
| `error` | text, nullable | exception message if the call failed; `response` will be null |
| `created_at` | timestamptz | set server-side at insert time |

**Behaviour:**
- A log row is written for **every** AI call, including failed ones (error stored in `error` column)
- Logging is fire-and-forget — a failure to write the log row must never surface as an error to the user
- The `prompt` column stores the complete assembled prompt (after compaction, with athlete context prepended) so it can be reproduced and debugged in isolation
- No frontend for this table in Phase 9 — logs are inspected directly via psql or `docker compose exec db psql`

**Querying logs locally:**
```sql
-- Recent calls with token usage and latency
SELECT created_at, endpoint, provider, model,
       input_tokens, output_tokens, duration_ms, error
FROM ai_request_logs
ORDER BY created_at DESC
LIMIT 20;

-- Inspect a specific prompt and response
SELECT prompt, response
FROM ai_request_logs
WHERE id = <id>;
```

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| API key encryption | Fernet (symmetric, key derived from `SECRET_KEY`) | Simple, auditable, no extra infrastructure |
| Supported AI providers | Anthropic (Claude Sonnet) + OpenAI (GPT-4o) | User choice; both are capable mid-tier models |
| Provider selection | Stored per user; auto-selected when only one key set | No friction for single-provider users |
| Weight unit | kg always | Avoids conversion complexity; closes Phase 2 backlog item |
| Adapt session scope | Strength only | Cardio adaptation is more useful in a plan context (Phase 10) |
| AI insights placement | History screen, below weekly summary | Keeps the main screen as the analytics hub; no new nav item |
| Keys never returned | `GET /profile` returns `has_anthropic_key` / `has_openai_key` booleans only | Prevents key exposure through normal API usage |
| Prompt caching | Applied to the 5-week history block in weekly insights (Anthropic only) | The static history is the expensive part; caching cuts repeat costs on Anthropic; OpenAI has no equivalent |
| Set compaction | Consecutive identical sets collapsed to `N×reps@weight` in all AI prompts | ~75% token reduction on typical strength sessions; stored data is unaffected |
| AI request logging | Every call logged to `ai_request_logs` table (prompt, response, tokens, latency, errors) | Full debuggability without a separate logging service; inspected via psql |

---

## Out of Scope for This Phase

- Adaptive session helper for cardio (deferred — see roadmap backlog)
- Weight unit preference (kg is the permanent choice)
- Streaming AI responses (simple request/response is sufficient)
- Saving or persisting AI-generated suggestions
- AI-powered template generation
