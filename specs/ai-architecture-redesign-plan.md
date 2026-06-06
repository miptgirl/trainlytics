# AI Architecture Redesign — Discovery & Design Plan

> **Status:** Draft v0.7 — iterating before execution.
> **Goal of this document:** Not the architecture itself. This is the *plan for how we arrive at* the
> best AI architecture for Trainlytics' coaching features. We finalize this plan first, then execute it.
> v0.5 makes every workstream concrete: the exact artifacts it produces and the exact way we obtain each input.

---

## 1. Why we're doing this

The current AI feels shallow: with a simple prompt the user gets generic, loosely-tied advice. This plan
replaces guesswork with a measured, decision-driven design process.

### Current state (the starting point)

Three single-shot, fire-and-forget endpoints — `weekly_insights`, `adapt_session`, `adapt_cardio_session`
([backend/app/api/ai.py](backend/app/api/ai.py)) — all funnel through one `call_ai()`
([backend/app/services/ai_service.py](backend/app/services/ai_service.py)).

Why the output is shallow / random:

- **Flat text context.** Context is assembled by string concatenation (`build_weekly_history_prompt`,
  `get_health_context_block`, athlete profile block). The model never sees the *derived signals* a real
  coach reasons over — it re-derives them badly, every call.
- **One shot, no agency.** No tools, no retrieval, no multi-step reasoning. The model can't look anything
  up, act, or ask for what's missing.
- **Freeform output.** Prose can't be tied to specific sessions/plans, and can't drive a "propose + approve"
  plan-editing model.
- **No evaluation.** "Shallow" is currently a vibe, not a measured, fixable defect.
- **Tight budget.** `max_tokens=1024` is too small for agentic / structured output.

### Reality check: we have almost no usage data

There is **one user** (the owner/athlete), who tried AI summary + adapt-strength a couple of times with
simple prompts and stopped because the answers were generic. **Implication:** mining `ai_request_logs` is
not worth much — the failure ("generic, not useful") is already understood. The high-value move is to
**elicit** requirements directly from the user and **gather richer data**, not to analyze a near-empty log.
This reshapes the plan: log-mining is dropped, and Workstream B (use-case elicitation) becomes the real
starting point.

We do, however, have **one rich production example** (a real weekly-insights prompt + answer). Rather than a
statistical sample, it serves as a concrete **anchor case** — dissected in [Appendix A](#appendix-a--production-anchor-case)
— that grounds the eval rubric and demonstrates, line by line, why the current approach fails even when the
output *looks* polished.

### Decisions locked (sync 2026-06-06)

| Decision | Choice | Implication |
|----------|--------|-------------|
| Scope | **Full redesign** | Derived-metrics layer + tool-using model + structured output + **actions** (AI can do, not just say). Replaces the string-concat `call_ai()` path. Folds in the planned agentic coach. |
| Provider model | **Keep BYO multi-provider** (Anthropic OR OpenAI) | Constrained to the *portable subset*: no provider-specific runtime; tool defs + output schemas abstracted behind `get_active_provider`. Portability is a hard scoring criterion. |
| Working mode | **Collaborative sync** | Claude preps each workstream; the user (athlete + primary user) drives judgment calls in elicitation and sports-science steps. |
| Data posture | **Elicit + gather** | With ~no usage data, prioritize structured elicitation (questionnaires/interviews) and new data capture over historical analysis. |

---

## 2. The plan: 8 workstreams

Letters are stable handles for discussion. **B, C, D, G** carry the weight; **I** (interaction model, added
in v0.7) defines the surface they ship into. The dropped Workstream A
(log-mining) is replaced by the single anchor case in [Appendix A](#appendix-a--production-anchor-case).
Each workstream lists **Purpose → How we execute → Artifacts produced**.

### Working conventions

- **All outputs live in a new folder `specs/ai-redesign/`**, one file per artifact, named by workstream
  (e.g. `B2-questionnaire.md`). The folder is the running record of discovery; the design brief is assembled
  from it at the end.
- **Owner tags** on steps: 🤖 = Claude does it and brings a draft; 👤 = needs the user (judgment / answers);
  🤖👤 = collaborative working session.
- **Every information source is named explicitly** — a specific code file to read, a specific DB query to
  run, a specific WebSearch query, a real artifact the user provides, or the live interview. No "we'll
  research it" hand-waves.

---

### Workstream B — Use-case elicitation (questionnaire + interview)
*The real starting point. Collaborative. We must extract use cases from the user, not guess them.*

**Purpose:** Build a complete, prioritized picture of what the user actually wants the AI to do — including
the use cases the user hasn't thought of yet.

Known seed use cases (from the user, to expand):
1. Analyze progress in **training load**.
2. Check how **vitals** are performing — is there measurable impact on fitness & health?
3. **Advice on improving the process** — what could be better.
> The user expects there's more they're missing; the questionnaire is designed to surface it.

A good questionnaire needs *two distinct research inputs* — conflating them produces a weak instrument:
- **(a) Elicitation methodology** — how to ask so we surface real needs, not flattering hypotheticals.
- **(b) Market/domain scan** — what comparable apps surface, used as a *menu to react to* (the cheapest way
  to surface blind spots), not a list to copy.

**How we execute:**
1. 🤖 **Market/domain scan → `B1-market-scan.md`.** Run WebSearch with concrete queries — e.g. *"Whoop
   coach AI insights features"*, *"TrainingPeaks PMC CTL ATL TSB explained"*, *"Oura readiness score
   inputs"*, *"Intervals.icu fitness fatigue form"*, *"Garmin training readiness factors"*. Output a table:
   `feature/insight · which apps offer it · what data it needs · 1-line description`. This is the *menu* the
   user reacts to.
2. 🤖 **Pick elicitation techniques** (no separate deliverable; baked into the questionnaire): *The Mom
   Test* (ask about past concrete behavior, never "would you like…"), *JTBD + laddering* (ask "why" to reach
   the underlying need), *Kano* (functional+dysfunctional question pair → must-have / performance /
   delighter).
3. 🤖 **Build the questionnaire → `B2-questionnaire.md`**, ~30–40 questions in 6 sections, each tagged with
   its technique/source. Concrete examples:
   - *Outcomes*: "Last time you opened the app's AI, what were you hoping to find out?"
   - *Current behavior (Mom Test)*: "Walk me through the last time you wondered if you were overtraining —
     what did you actually do/check?"
   - *Desired AI behavior*: "Your long run stalled at 6 km for 2 weeks — what exactly should the app say?"
   - *Anti-goals*: "What would make you distrust the AI and stop using it?"
   - *React-to-the-menu (Kano)*: for each `B1` feature — "If the app forecast your race-day fitness, how
     would you feel? / If it didn't?"
   - *Scenario probe*: "It's Monday, you slept badly 3 nights — what should the AI say or do?"
   - *Forced ranking*: rank the surfaced use cases top-to-bottom.
4. 🤖👤 **Run it as a live interview in a Claude session** (not a static form): Claude asks, the user
   answers, Claude follows up live and laddering on interesting answers; transcript saved to
   `B3-interview-notes.md`.
5. 🤖 **Synthesize → `B4-jtbd.md`**: a JTBD table — `trigger · the real question · what a *great*
   answer/action looks like · frequency · Kano class · priority`.
6. 🤖👤 **Capture 10–20 gold-standard examples → `B5-gold-examples.md`.** Method: pull the user's *real*
   logged data (same shape as the anchor case) for several past weeks; for each, the user states the ideal
   answer/action they'd have loved. These become eval cases (H) alongside the anchor case.

**Artifacts:** `B1-market-scan.md`, `B2-questionnaire.md`, `B3-interview-notes.md`, `B4-jtbd.md`,
`B5-gold-examples.md`.

---

### Workstream C — Coaching knowledge base (science-backed + personalization)
*Collaborative. Output is a durable knowledge base the AI can ground decisions in.*

**Purpose:** Give the AI a real model of training so advice is grounded in best practice, not the model's
vague priors. Personalize it to the individual (age, gender, weight, goals, experience, limitations).

**How we execute:**
1. 🤖👤 **Scope topics → `C1-topics.md`.** Build it from both ends and intersect:
   - *Bottom-up* — turn each `B4` JTBD into the topic it needs ("should I extend the long run?" → endurance
     progression).
   - *Top-down* — a fixed coaching taxonomy: training load, endurance/run progression, strength
     progression, periodization & tapering, recovery & sleep, concurrent/hybrid interference, injury-aware
     programming, nutrition-at-a-glance, **and health-signal interpretation (HRV / resting HR / sleep /
     VO2max → readiness, recovery, aerobic fitness)**.
   - *From E (runs first)* — **E-discovery precedes C** so we know which signals exist before scoping the
     science. E's `E2` candidate-insight list directly seeds C's health-signal topics: every signal we want
     to act on needs a C card explaining the physiology and science-backed interpretation. **C is the single
     home for the science; E operationalizes it on our data** (see the C↔E note below).
   - Output a table: `topic · priority (from JTBD) · decision questions the KB must answer`. Examples —
     *Endurance progression · high · "How fast can the long run safely grow toward a 10 km goal in N weeks?"*;
     *Health-signal interpretation · high · "When does an HRV / resting-HR shift warrant easing the plan?"*
2. 🤖 **Curate sources → `C2-sources.md`** with a credibility hierarchy (quality over volume):
   meta-analyses/systematic reviews > governing-body position stands (ACSM, NSCA) > textbooks > established
   practitioner sources > blogs (mostly excluded). How: WebSearch concrete queries per topic — e.g.
   *"acute chronic workload ratio injury risk systematic review"*, *"10 percent rule running mileage
   evidence"*, *"concurrent training interference effect meta-analysis"*, *"ACSM position stand resistance
   training progression"* — find reviews first, snowball references. Record `claim · source · tier · year ·
   applicability-to-this-athlete (beginner / female / knee+scoliosis)`.
3. 🤖 **Write knowledge as "insight cards" → `C3-playbook/` (one file per card)**, fixed schema, YAML
   front-matter + prose. Worked example:
   ```yaml
   id: endurance-longrun-progression
   topic: endurance-progression
   rule: "Grow the weekly long run by ~10% (cap ~+1–2 km/wk); every ~4th week reduce ~30% (down week)."
   applicability: ["goal: distance race", "experience: beginner"]
   inputs_required: ["weekly long-run distance series", "goal distance", "weeks to goal"]
   decision: "How much to extend this week's long run."
   evidence_tier: practitioner+review
   confidence: medium
   caveats: ["respect knee load — cap single-week jumps", "heat reduces tolerable volume"]
   personalization: {beginner: "be conservative", knee_injury: "smaller increments, more down weeks"}
   sources: [C2#runner-progression-review]
   ```
4. 🤖 **Capture personalization factors → `C4-personalization-map.md`**: how age / gender / bodyweight /
   goals / experience / injuries modify the rules (sourced from the profile model + the D onboarding
   questionnaire).
5. 🤖👤 **Validate each card against the anchor case** (Appendix A): does the card, applied to that athlete,
   produce *better* advice than the production answer (e.g. "extend long run ~0.5 km/wk toward 10 km" instead
   of "cap at 6–7 km")? Cards that don't change a bad answer get cut. Result logged in each card's file.
6. 👤 **Adjudication & versioning:** where science conflicts with the user's experience, the user decides;
   annotate and version the card.
7. **KB representation** (flat cards vs. **knowledge graph**) is an architecture choice — routed to F.

**Artifacts:** `C1-topics.md`, `C2-sources.md`, `C3-playbook/*.md` (the insight cards),
`C4-personalization-map.md`.

> **C ↔ E split (no duplication).** The *science* of interpreting any signal — training **or** health —
> lives as a C insight card (e.g. `health-hrv-readiness`, `health-resting-hr-overreaching`). Workstream E
> does **not** re-derive that science; it researches *what signals the export actually contains* and turns
> each C card into a *computable rule on our data* (transformation, personal baseline, data-feasibility,
> backtest). In short: **C = "what's true and why"; E = "can we compute it here, and does it hold on real
> data."** E's first validation gate ("literature-backed?") is literally "does a C card back this?".

---

### Workstream D — Data audit + new data capture design
*Not just "what do we have" — also "what should we start collecting."*

**Purpose:** Map coaching decisions (B/C) to the data they need, find gaps, and design new capture —
including richer Apple Health pull, better readiness inputs, and an onboarding questionnaire.

**How we execute:**
1. 🤖 **Inventory the schema → `D1-data-inventory.md`.** Read the model files
   ([backend/app/models/](backend/app/models/) — `session.py`, `body_metrics.py`, `plan.py`, `template.py`,
   `user_settings.py`) and migrations ([backend/migrations/versions/](backend/migrations/versions/)). Output
   a table: `table.column · type · source (manual / Strava / Apple Health) · granularity · freshness`.
2. 🤖 **Measure data quality with real DB queries → `D2-data-quality.md`** (this turns assertions into
   numbers). Concretely:
   - fill-rate per nullable column (`% non-null` for wellbeing, rpe, hrv, resting_hr, sleep, etc.),
   - **value distribution of `wellbeing` and `rpe`** to prove the "always okay/moderate" problem
     (`SELECT wellbeing, count(*) … GROUP BY wellbeing`; same for rpe),
   - `body_metrics` coverage: date range + gaps + upload cadence (validates Apple Health freshness for E).
3. 🤖 **Build the decision→data matrix → `D3-decision-data-matrix.md`:** for every decision question in
   `C1`, mark each required input `available / derivable / missing`.
4. 🤖 **Propose new metrics → `D4-new-capture.md`** for the gaps: (a) additional Apple Health fields (from
   E's catalog), (b) new in-app capture.
5. 🤖👤 **Redesign the readiness inputs → `D5-readiness-redesign.md`.** First read the current UX
   ([frontend/src/components/EmojiRating.tsx](frontend/src/components/EmojiRating.tsx) and its use in
   [frontend/src/pages/LogWorkoutPage.tsx](frontend/src/pages/LogWorkoutPage.tsx)). Then, grounded on the
   `D2` distribution: pick better-anchored scales (RPE with concrete per-level descriptors; sRPE = RPE ×
   duration), consider an objective HRV-based readiness alternative, add micro-education copy, and propose a
   quick wording self-test.
6. 🤖👤 **Design an onboarding questionnaire → `D6-onboarding.md`** for durable context captured once (goals,
   training history, preferences, constraints, equipment, schedule) → feeds `C4` and the profile model.
7. 🤖 **Outline the athlete-state layer → `D7-athlete-state.md`:** the set of derived metrics + where each
   lives (precomputed in DB/service vs. on-demand vs. exposed as a G tool). This replaces the current
   string-concat prompt builders. Each derived metric ships with **unit tests asserting arithmetic
   correctness against hand-computed values from the anchor case** — anchor fail #1 was bad arithmetic, and
   moving arithmetic into a layer only fixes it if that layer is tested.

**Artifacts:** `D1-data-inventory.md`, `D2-data-quality.md`, `D3-decision-data-matrix.md`,
`D4-new-capture.md`, `D5-readiness-redesign.md`, `D6-onboarding.md`, `D7-athlete-state.md`.

---

### Workstream E — Apple Health deep-dive
*The richest data source we have — worth its own study.*

**Purpose:** Enumerate everything AH can give (especially about training), and **operationalize** each signal
into a computable, validated rule on *our* data — honestly bounded by data freshness.

**Order & relationship to C:** E is split in two. **E-discovery (steps 1–2 below) runs *before* C** — its
signal catalog and candidate-insight list tell C exactly which health-signal cards to author. **E-validation
(step 3, the five gates incl. backtest) runs *after* C**, since gate #1 checks each insight against a C card.
E never researches physiology in isolation: the *science* lives in C; E owns the data engineering (what's in
the export, the transformation, the personal baseline, feasibility, the backtest). See the
[C↔E split](#workstream-c--coaching-knowledge-base-science-backed--personalization).

An insight is defined as **signal(s) + transformation + rule/threshold + recommended action + confidence**
(e.g. "HRV 7-day mean drops >X% below 60-day *personal* baseline → readiness reduced → propose easier
session"). The hard part is **validation** — and with one user we can't use population statistics, so it's
layered.

**How we execute:**
*E-discovery (before C):*
1. 🤖👤 **Enumerate what's actually in the export → `E1-ah-record-types.md`.** 👤 the user provides their real
   `export.xml` (not committed to the repo); 🤖 parse it to list every `HKQuantityTypeIdentifier*` /
   `HKCategoryTypeIdentifier*` / `HKWorkoutActivityType*` present, with record counts and date ranges.
   Cross-reference against what we import today
   ([backend/app/services/apple_health_service.py](backend/app/services/apple_health_service.py)) to produce
   a `present in export · imported today · candidate to import` table. Expect: workouts (per-type, HR series,
   route, splits), sleep stages, HRV (SDNN), resting HR, VO2max, active/basal energy, step count,
   respiratory rate, mindfulness, cycle data.
2. 🤖 **Generate candidate insights → `E2-insight-catalog.md`.** For each signal define `signal(s) ·
   transformation (baseline / trend / deviation / ratio) · rule/threshold · action · confidence`.
*E-validation (after C cards exist):*
3. 🤖👤 **Validate each candidate through five gates** (logged in the catalog; ships only if it clears all):
   1. *Literature-backed?* signal→meaning link grounded in a `C3` card — if none exists, raise the topic to
      C to author one. Reject folk wisdom.
   2. *Data-feasible?* sufficient frequency/quality given `D2`'s measured upload cadence (an insight needing
      daily HRV is dead on arrival if uploads are monthly).
   3. *Baseline-aware?* define the personal rolling baseline + minimum history before it "activates."
   4. *Backtest on real data* — 🤖 write a throwaway script that replays the rule over the user's own
      `body_metrics` + sessions (the anchor case is drawn from this same history — one user): would it have
      fired sensibly, and does it line up with the free-text notes ("poor sleep from heat," "felt good")?
   5. *Confidence-labeled* — carry confidence + rationale so the AI hedges instead of asserting noise (the
      anchor-case RPE mistake).
4. 🤖 **Feasibility & pipeline notes** appended to `E2`: which insights work on periodic uploads vs. need
   fresher data; any import-pipeline or baseline-computation changes required.

**Artifacts:** `E1-ah-record-types.md`, `E2-insight-catalog.md` (each entry with transformation, rule,
evidence tier, data-feasibility, baseline requirement, backtest result, confidence) — merged into `D3`.

---

### Workstream F — Architecture & framework research / selection
*Research the best way to build AI systems for this situation, then choose. Depends on B–E + G + I's needs
(I's turn/memory model is a hard input to the architecture and the `F1` memory row).*

**Purpose:** Decide *how* the system is built — and justify it against our actual requirements rather than
defaulting to a pattern.

**How we execute:**
1. 🤖 **Pattern catalog → `F1-pattern-catalog.md`.** For each building block / pattern, a row:
   `when used · strengths · weaknesses · cost · latency · provider-portability (BYO) · maturity`. Patterns to
   cover: single-shot+context; **vector RAG** (for the C playbook); **knowledge graph / GraphRAG** (candidate
   for both the KB *and* the athlete-state model — exercise→muscle-group→imbalance, goal→capability→gap);
   **structured DB + derived-metrics layer**; **tool-use agent loop**; **structured output**; **memory**.
   Sources (named): Anthropic cookbook + the `claude-api` skill (Claude tool use / structured outputs /
   prompt caching / agent SDK), OpenAI function-calling docs, and WebSearch — *"RAG vs GraphRAG when to
   use"*, *"LLM agent over personal/structured data reference architecture"*, *"AI coach LLM health data
   architecture"*.
2. 🤖 **Selection criteria → `F2-criteria.md`** (with weights), derived from the workstreams: groundedness,
   action support, **provider-portability** (BYO Anthropic/OpenAI — hard constraint), latency, **cost per
   insight under BYO keys** (a *weighted* criterion, not a hard gate — see `F5`), prompt-caching fit,
   build/maintain complexity.
3. 🤖 **Requirements → pattern fit matrix → `F3-fit-matrix.md`:** map each requirement from B/C/D/E/G to the
   patterns, then shortlist 2–3 candidate architectures (likely a blend: derived-metrics layer + retrieval
   over the playbook + agentic tool-use + structured output). Score in an options matrix against `F2`.
4. 🤖👤 **Validate by spike, not by argument → `specs/ai-redesign/F-spike/`:** build a thin runnable prototype
   of the riskiest shortlisted candidate, wire it to a couple of real `D7`/`G` tools, run it on the anchor
   case + 2–3 `B5` gold examples, and score with the `H` rubric. **The spike instruments token usage and cost,
   not just quality** (see `F5`), and is where the **single-model vs. model-tiering** question is settled —
   run the same case both ways (one model end-to-end vs. cheap model for tool-arg/retrieval/clarifying turns +
   expensive model for final synthesis) and compare quality-per-dollar. The numbers, not opinion, pick the
   winner.
5. 🤖 **Cost model → `F5-cost-model.md`.** Estimate **$/insight** for each shortlisted architecture *before*
   the spike (so the F3 scoring is grounded), then refine with the spike's measured token counts. Method:
   take the anchor case's real input size; for each candidate, count `input tokens × tool-loop round-trips +
   output tokens`, split into **cached vs. uncached** input (prompt caching makes the static prefix — coaching
   KB + tool defs + athlete-state — ~10× cheaper on reads), and apply current Anthropic *and* OpenAI per-token
   pricing (portability means we cost both providers). Output a table: `architecture · model(s) · input(cached/
   uncached) · output · round-trips · $/insight (Anthropic) · $/insight (OpenAI)`, plus a projected $/month at
   expected usage. **No hard ceiling** (single-user BYO, low volume — absolute cost is small): the goal is to
   stay cost-*aware* and avoid waste (runaway tool loops, re-sending uncached context, oversized retrieval),
   and to make the cost lever visible in the F4 trade-off rather than discovered in production. **Prompt
   caching of the static prefix is treated as a default** for any agentic/large-context candidate.
6. 🤖 **Decide → `F4-decision.md`:** chosen architecture + framework question (raw provider SDKs vs. agent
   framework, constrained to the portable subset) + the model-tiering verdict from the spike + rationale +
   risks, with the `F5` cost figures cited in the trade-off.

**Artifacts:** `F1-pattern-catalog.md`, `F2-criteria.md`, `F3-fit-matrix.md`, `F-spike/` (runnable),
`F4-decision.md`, `F5-cost-model.md`.

---

### Workstream G — AI capabilities, actions & information-gathering
*The big missing block: what the AI can DO, and how it gets what it needs.*

**Purpose:** Define the AI beyond an advice-giver — as something that can take actions and actively gather
missing information from the data, the outside world, or the user.

Three sub-parts:

**G1 — Capabilities & actions (beyond advice).** Enumerate candidate actions, e.g.:
- propose & create a new strength session / weekly plan,
- modify an existing plan (move/remove/add/adjust-volume sessions),
- update notes on the user profile (coach notes, goals, limitations),
- adjust templates, log/annotate sessions.
Each action is classified **read** (analysis) vs. **write/propose** — and every write goes through the
**propose + approve, never auto-apply** gate **and is checked against the athlete's safety constraints (the
C cards' injury caps / caveats) before it is surfaced. An unsafe proposal is blocked or downgraded with a
rationale, never silently shown** (the anchor case recommended a long-run cap that would sabotage the goal —
the inverse failure, an unsafe *increase*, must be guarded the same way).

**G2 — Information-gathering (from the outer world or the user).** How the AI fills gaps:
- **from our data** — tools over the athlete-state / DB layer,
- **from the user** — the AI can ask clarifying questions mid-flow (human-in-the-loop) when input is
  ambiguous (ties back to the readiness-input problem in D),
- **from the outside world** — if/when external lookups are in scope (define boundaries; default off given
  BYO-key + privacy).

**G3 — Tool specification.** Concretize G1+G2 into a tool list derived from the `D3` matrix and **mapped to
existing backend endpoints** so each tool is a thin wrapper, not new surface. Read tools come from
[analytics.py](backend/app/api/analytics.py) / [plan_summary.py](backend/app/api/plan_summary.py) /
[sessions.py](backend/app/api/sessions.py); write/propose tools from [plans.py](backend/app/api/plans.py) /
[profile.py](backend/app/api/profile.py) / [templates.py](backend/app/api/templates.py). Worked example:
```json
{ "name": "propose_plan_edit",
  "description": "Propose one change to next week's plan for the user to approve.",
  "input_schema": {"type":"object","properties":{
    "op": {"enum":["add_session","move_session","remove_session","adjust_volume"]},
    "target_session_id": {"type":["integer","null"]},
    "payload": {"type":"object"},
    "rationale": {"type":"string"}}},
  "class": "propose", "approval": "required", "backs_onto": "POST /plans/{id}/sessions" }
```

**How we execute:**
1. 🤖 **Capability catalog → `G1-capabilities.md`:** derive candidate actions from the `B4` JTBD table (every
   high-priority job implies a capability); classify each read vs. write/propose; map each to a real
   endpoint (or flag "needs new endpoint").
2. 🤖 **Info-gathering model → `G2-info-gathering.md`:** define when the AI pulls from data (tools), when it
   asks the user a clarifying question (`ask_user` — the human-in-the-loop fallback for ambiguous input, ties
   to the D5 readiness problem), and the boundary on outside-world access (default off; revisit per §4).
3. 🤖 **Tool spec → `G3-tools.md`:** JSON schemas like the example above — `name · description · input_schema
   · read/propose class · approval requirement · backing endpoint`. **Provisional until F4** — the framework
   choice (raw SDK vs. agent framework, retrieval shape) can reshape the tool surface, so freeze G3 only
   after the architecture is decided.
4. 🤖👤 **Approve/reject UX → `G4-hitl-ux.md`:** the diff-style flow for proposed writes (reuse the existing
   adapt/plan modal patterns — [AdaptSessionModal.tsx](frontend/src/components/AdaptSessionModal.tsx),
   [plan/](frontend/src/components/plan/)); hand portability constraints to F.
5. 🤖 **Safety constraints → `G5-safety-constraints.md`:** translate the C cards' caveats / injury caps (e.g.
   knee load, single-week long-run jump cap, minimum down-week cadence) into **machine-checkable guards** on
   write/propose tools — a proposal violating a guard is blocked or downgraded with a rationale. This is the
   enforcement half of the *safety / harm-avoidance* rubric dimension in H.

**Artifacts:** `G1-capabilities.md`, `G2-info-gathering.md`, `G3-tools.md`, `G4-hitl-ux.md`,
`G5-safety-constraints.md`.

---

### Workstream I — Interaction & delivery model
*The shape of the feature. Without it, G's actions and F's architecture get designed in a vacuum and retrofitted.*

**Purpose:** Define the AI's *surface* — when it's invoked, in what modality, and the turn/state model — so
the capabilities (G), the human-in-the-loop fallback (G2), and the architecture (F) are built for the right
shape instead of being bolted onto the legacy three single-shot endpoints. The redesign introduces agency,
write-actions, and mid-flow clarifying questions (`ask_user`); all three imply turns and state that the
current fire-and-forget model can't carry.

**How we execute:**
1. 🤖 **Map invocation surfaces → `I1-surfaces.md`.** From the `B4` JTBD table (its `trigger · frequency`
   columns) and the current entry points ([backend/app/api/ai.py](backend/app/api/ai.py)), inventory where
   the AI is or should be triggered — weekly review, per-session adapt, on-demand question, proactive nudge.
   For each: `trigger · cadence · sync vs. async · read-only vs. can-propose`.
2. 🤖👤 **Choose the modality per surface → `I2-modality.md`.** Decide, per surface: one-shot structured
   report vs. multi-turn conversational agent vs. proactive nudge. Drive it from `B4` (which jobs genuinely
   need back-and-forth or `ask_user`) and the `G2` info-gathering model — not every surface needs a chat.
   **Modality is also a cost lever:** a conversational/agentic surface multiplies model turns (and therefore
   `F5` $/insight) versus a one-shot report, so reserve it for jobs that genuinely need it.
3. 🤖 **Turn & state model → `I3-turn-model.md`.** For conversational surfaces: session lifecycle, and **what
   persists between turns and across sessions** — ties to F's *memory* pattern, `C4` personalization, and the
   record of which proposals the user accepted/rejected. Place the `G4` propose+approve gate explicitly in
   the flow.
4. 🤖👤 **Map to existing UI → `I4-ui-map.md`.** Reuse current surfaces (weekly-insights view,
   [AdaptSessionModal.tsx](frontend/src/components/AdaptSessionModal.tsx),
   [plan/](frontend/src/components/plan/)) vs. introduce a new conversational surface; hand the UX +
   portability constraints to F and `G4`.

**Depends on:** `B4` (JTBD). **Feeds:** G (capabilities/actions are shaped by modality) and F (the chosen
turn/memory model is a hard input to the architecture and the `F1` pattern catalog's *memory* row).

**Artifacts:** `I1-surfaces.md`, `I2-modality.md`, `I3-turn-model.md`, `I4-ui-map.md`.

---

### Workstream H — Evaluation approach
*Runs throughout. Adapted for the low-data reality.*

**Purpose:** Be able to prove the redesign beats the baseline, even without large historical data.

**Build timing (resolves the "runs throughout" vs. step-ordering tension):** `H2` (rubric) and `H3` (baseline)
are built **first** — they need only the anchor case, which exists today, and they are *prerequisites* for
`C5` (judging whether a card produces "better" advice) and the `F` spike (scored "with the H rubric").
`H1` completes once `B5` lands. H is then *applied* (re-scored) at each milestone; the step-7 "gate" in the
sequencing table is this application, not the construction.

**How we execute:**
1. 🤖 **Rubric → `H2-rubric.md` (build first):** scored 1–5 with explicit anchors per dimension, derived from
   the anchor-case failure modes:
   - *Arithmetic / data-groundedness* — are numbers correct and actually computed? (anchor fail #1)
   - *Goal-tied reasoning* — tied to prioritized goals + timeline math? (#3, #7)
   - *Signal vs. noise* — does it hedge on low-information inputs? (#4)
   - *Use of free-text notes* — does it connect the notes? (#5)
   - *Actionability* — concrete next step / proposed plan, not "monitor"? (#6)
   - *Safety / harm-avoidance* — does it respect injury caps and avoid advice that risks harm **or** sabotages
     the goal? (anchor fail #3: capping the long run would block the half-marathon; enforced via `G5`.)
   - *Non-genericness* — would this make sense for *any* athlete, or only this one?
2. 🤖 **Baseline → `H3-baseline.md` (build first):** score the current production answer against the rubric
   (already weak — Appendix A) to set the bar before any design work starts.
3. 🤖 **Eval set → `H1-eval-set.md`:** the anchor case (Appendix A) + the `B5` gold examples (so completes
   after B), each as `input · expected qualities`.
4. 👤 **Choose scoring method:** manual rubric first vs. early LLM-as-judge automation (open question §4).
5. 🤖 **Re-score** at each design milestone (the F spike, the G prototype) before committing.

**Artifacts:** `H1-eval-set.md`, `H2-rubric.md`, `H3-baseline.md` (+ optional `H4-judge.md`).

---

## 3. Suggested sequencing

**E is split** because E and C have a two-way dependency: E's *signal enumeration* tells C what to research,
but E's *validation* needs C's cards. So **E-discovery runs before C; E-validation runs after C.**

| Step | Workstreams | Output |
|------|-------------|--------|
| 1 | **B** (elicitation) + **H2/H3** (rubric + baseline, from the anchor case) | Questionnaire, JTBD table, gold examples; the eval rubric & scored baseline that gate everything downstream |
| 2 | **E-discovery** (E1–E2) + D1–D2 (inventory + data-quality) | Signal catalog & candidate insights; what to look for in C |
| 3 | **C** (knowledge base) | Coaching playbook, incl. health-signal cards driven by E's catalog (validated against the rubric) |
| 4 | **E-validation** (E gates incl. backtest) + D3–D7 | Validated insights; decision→data matrix; new-capture & athlete-state |
| 5 | **I** (interaction model) → **G** (capabilities/actions/tools + safety) | Surface & turn model; capability + provisional tool spec + safety guards |
| 6 | F | Architecture & framework decision (consumes I's turn/memory model; finalizes G3) |
| 7 | H (apply: re-score the design vs. baseline) | Validated design ready to implement |

(B's JTBD + E-discovery's signal catalog together scope C — we go in knowing both the *questions* to answer
and the *signals* available to answer them with. H2/H3 are built up front in step 1 because C5 and the F
spike both score against them; step 7 *applies* the rubric, it doesn't build it. I precedes G in step 5 so
capabilities and tools are shaped by the chosen surface, and feeds F's memory/turn requirements in step 6.)

**Final output of this plan:** a *design brief* (`specs/ai-redesign/DESIGN-BRIEF.md`) assembled from the
workstream artifacts — chosen architecture + cost model (`F4`/`F5`), coaching playbook (`C3`),
athlete-state/data layer (`D7`), interaction & turn model (`I2`/`I3`), capability + tool spec + safety guards
(`G1`/`G3`/`G5`), new-data-capture plan (`D4`/`D5`/`D6`), and eval harness (`H`) — ready to turn into
implementation specs.

---

## 4. Open questions to resolve while iterating on this plan

- **Questionnaire delivery:** run B as a live interview with Claude, a written doc you fill in, or both?
- **New data capture during discovery:** are we allowed to ship schema/migration changes (e.g., richer AH
  import, redesigned readiness inputs) *during* discovery, or stay read-only until the design is locked?
- **Knowledge base format:** author as markdown now and decide RAG vs. context-injection in F, or commit to
  a format up front?
- **Action scope for v1:** how far do AI write-actions go initially — plan editing only, or also profile
  notes / templates / logging?
- **External-world access:** in scope at all for v1, or explicitly deferred for privacy/BYO-key reasons?
- **Readiness redesign:** appetite to replace RPE/wellbeing wording outright vs. add objective
  (HRV-based) readiness alongside?
- **Eval:** manual rubric first, or invest early in LLM-as-judge?

---

## Appendix A — Production anchor case

A real `weekly-insights` call (athlete: beginner, 36, knee injury + scoliosis; **high-priority goal: survive
a half marathon on 6 Sept, run ≥10 km**; ~6 weeks of mixed run/strength history). The full prompt + answer
are archived alongside this plan. The answer *reads* well — which is exactly why it's instructive. Below,
each failure is tagged with the workstream that fixes it.

**What the answer got wrong or missed:**

1. **Never computed weekly volume — the one thing the prompt asked for.** It claims running volume "nearly
   doubled" with no numbers. Actual weekly run distance ≈ 9.9 → 6.6 → 13 → 15.1 → 16 km — a ~62% rise, *and
   it silently skipped the W20 drop*. The model cannot reliably do arithmetic over a text dump. → **D**
   (derived-metrics layer), **G** (compute-via-tools), **F** (DB access pattern).
2. **Missed the most important fact for the goal: the long run has stalled at ~6 km for two weeks.** Long-run
   progression: 4.45 → 3.81 → 5.15 → 6.01 → 5.65 km. For a half-marathon build this is the headline. → **C**
   (knowledge base: long-run progression), **G** (goal-aware reasoning).
3. **The headline advice contradicts the #1 goal.** It recommends "cap long runs at 6–7 km." The goal is
   10 km in **exactly 13 weeks** (today 2026-06-06 → 2026-09-06); she needs ~+4 km of long run (~0.3 km/week
   — very achievable). Capping would prevent reaching the goal. → **C** (periodization/goal math), **B**
   (advice must be tied to prioritized goals).
4. **Read confidently into noise.** "Wellbeing 2–4/5, RPE 2–3/10 → room to increase intensity." But the user
   *always* picks okay/moderate, so this is non-signal. → **D** (readiness-input redesign), **C**
   (signal-quality awareness).
5. **Wasted the rich free-text notes.** "Knee finally restored," "poor sleep from heat," sore
   hamstrings/calves — a coach connects these to load; the AI said "monitor." → **D** (model notes as
   structured context), **C**.
6. **Output is prose, not action.** No proposed next-week plan, no concrete progression, despite the app
   being able to create/edit plans. → **G** (capabilities & actions: propose a plan), structured output.
7. **No goal/timeline anchoring at all.** It says "on track" without ever doing the date math to Sept 6.
   → **B/C/G**.

**Conclusion:** the failure is not the model's writing — it's that it's asked to be an analyst, planner, and
coach from a flat text blob with no computed metrics, no domain knowledge, no goal math, no notion of signal
quality, and no ability to act. This single case is eval target #1.

---

## Changelog

- **v0.7 (2026-06-06):** Strengthening pass. **Added Workstream I — Interaction & delivery model** (surfaces,
  modality, turn/state model, UI map): the redesign adds agency, write-actions, and `ask_user`, which imply a
  turn/state model the legacy single-shot endpoints can't carry; I now precedes G and feeds F. **Added
  safety/harm-avoidance end-to-end:** a new rubric dimension in H plus an enforcement half — `G5-safety-constraints`
  translates C injury caps/caveats into machine-checkable guards on write/propose tools (motivated by the
  anchor case advising a goal-sabotaging long-run cap). **Fixed H sequencing:** H2 (rubric) + H3 (baseline)
  are now built up front in step 1 (they gate C5 and the F spike); step 7 is the *application* of the rubric,
  not its construction. **Flagged G3 tool schemas provisional until F4** (framework choice can reshape tool
  surface). **Added arithmetic-correctness unit tests to the D7 derived-metrics layer** (anchor fail #1 was
  arithmetic — moving it into a layer only helps if the layer is tested). Clarified the E backtest wording
  (the anchor case is the same single user). Sequencing, design-brief assembly, and F's dependency note
  updated for I/G5. Per decision: win condition stays qualitative ("beats the baseline on the rubric"); the
  document still ends at the design brief (no implementation/rollout section). **Added LLM cost-awareness:**
  new `F5-cost-model.md` estimates `$/insight` per candidate architecture (cached vs. uncached input × tool
  round-trips × output, priced on both Anthropic and OpenAI); the F spike now instruments token/cost and is
  where the single-model-vs-tiering question is settled; cost stays a *weighted* F2 criterion (no hard ceiling
  — single-user BYO, absolute cost is small), prompt-caching of the static prefix is a default, and modality
  choice (I2) is flagged as a cost lever.
- **v0.6 (2026-06-06):** Resolved the C/E overlap and reordered. Apple Health insight *science* now lives in
  the C knowledge base (added "health-signal interpretation" topic + a C↔E split note); E owns
  operationalization only. Split E into **E-discovery (before C)** and **E-validation (after C)** so the
  signal catalog scopes what C researches while validation still checks each insight against a C card.
  Sequencing updated to B → E-discovery → C → E-validation → G → F → H. Specificity pass across all workstreams — every step now names its exact artifact
  (`specs/ai-redesign/` files), information source (specific code file, DB query, WebSearch query, the user's
  real `export.xml`, or the live interview), and owner (🤖 / 👤 / 🤖👤). Added: D2 data-quality DB queries
  proving the RPE/wellbeing problem; worked examples for an insight card (C3), a tool schema (G3), and the
  eval rubric (H2); G tools mapped to existing backend endpoints; F spike folder; design-brief assembly path.
- **v0.4 (2026-06-06):** Deepened method ("how") for four workstreams. B: split research into elicitation
  methodology (Mom Test / JTBD / laddering / Kano) + market scan; layered questionnaire construction with
  provenance. C: bottom-up×top-down topic scoping, source credibility hierarchy, "insight card" schema,
  anchor-case validation. E: insight defined as signal+transform+rule+action+confidence, five-layer
  validation (literature / data-feasible / baseline / backtest / confidence). F: added knowledge-graph /
  GraphRAG as a candidate, market pattern catalog, requirements→pattern fit matrix, validate-by-spike.
- **v0.3 (2026-06-06):** Dropped Workstream A (log-mining) per feedback; replaced with the production anchor
  case (Appendix A) dissecting a real weekly-insights answer and mapping each failure to a workstream. Eval
  rubric (H) now derived from the anchor case. 8 → 7 workstreams.
- **v0.2 (2026-06-06):** Reframed for low-data reality (A shrinks; B elicitation leads). C now produces a
  science-backed knowledge base + personalization. D adds new-metric capture, readiness-input redesign, and
  onboarding questionnaire. E strengthened (AH = anything about training). F reframed as build-approach
  research (RAG/DB/agentic/tools selection). G expanded into AI capabilities/actions + info-gathering +
  tool spec. Added "How we execute" to every workstream.
- **v0.1 (2026-06-06):** Initial draft. Scope/provider/working-mode decisions locked.
