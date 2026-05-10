# Phase 6 — Export & Draft Recovery: Plan

## Group 1 — Export formatting utility ✅

1.1 Create `frontend/src/lib/exportUtils.ts` with two pure functions:
  - `formatStrengthSession(session: StrengthSession): string` — returns markdown string
  - `formatCardioSession(session: CardioSession): string` — returns markdown string
  
Use existing unit conversion helpers (`metresToKm`, `secPerKmToMinPerKm`, etc.) already in `unitUtils.ts`.

1.2 Write unit tests in Vitest covering:
  - Strength session with multiple exercises and sets
  - Cardio session with multiple named and unnamed segments
  - Null/missing optional fields (calories, notes, set weight/reps, segment title)

---

## Group 2 — Copy button on detail pages ✅

2.1 Add a "Copy" icon button to `StrengthSessionDetailPage.tsx`:
  - Positioned near the session header (alongside Edit/Delete)
  - On click: calls `formatStrengthSession` with already-fetched session data, writes to clipboard, shows "Copied!" feedback for 2 s

2.2 Add a "Copy" icon button to `CardioSessionDetailPage.tsx` with identical behaviour.

---

## Group 3 — Copy button on history list rows ✅

3.1 Add a "Copy" icon button to each session row in `HistoryPage.tsx`.
  - On click: fetch the full session via `GET /sessions/strength/{id}` or `GET /sessions/cardio/{id}` (type is known from `SessionSummary.type`)
  - Format and copy to clipboard once the response arrives
  - Show a loading state on the button while fetching, then "Copied!" on success

---

## Group 4 — Draft localStorage utilities ✅

4.1 Create `frontend/src/lib/draftUtils.ts` with typed helpers:
  - `saveDraft(type: 'strength' | 'cardio', data: object): void`
  - `loadDraft(type: 'strength' | 'cardio'): object | null`
  - `clearDraft(type: 'strength' | 'cardio'): void`

Keys: `trainlytics_draft_strength` / `trainlytics_draft_cardio`.

---

## Group 5 — Draft integration: strength form ✅

5.1 In `LogWorkoutPage.tsx` (strength tab):
  - On every `watch()` change, call `saveDraft('strength', { ...values, templateId })`
  - On mount, call `loadDraft('strength')` and if non-null, show restore banner
  - Restore: call `reset(draft)` with the draft values and set templateId state; hide banner
  - Discard: call `clearDraft('strength')`; hide banner
  - On successful submit: call `clearDraft('strength')`

---

## Group 6 — Draft integration: cardio form

6.1 Same pattern as Group 5 but for the cardio tab:
  - `saveDraft('cardio', values)` on every change
  - Restore / Discard banner on mount if draft exists
  - `clearDraft('cardio')` on successful submit

---

## Group 7 — Manual QA pass

7.1 On desktop and iPhone-sized viewport: verify export copies correct markdown for both session types from both entry points (detail page and history row).

7.2 Verify draft restore works for strength (from template and without template) and cardio, that switching tabs doesn't lose the other draft, and that submitting clears only the relevant draft.
