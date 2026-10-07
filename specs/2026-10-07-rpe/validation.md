# Session RPE on 1–10
## Validation

### Progress

| Task Group | Status |
|---|---|
| A. Session RPE on 1–10 | ✅ |
| B. Save-time checks and errors | ✅ |
| Tests | ✅ |

---

### Definition of Done

- [x] Existing session RPE values converted by the migration; downgrade restores them
- [x] Session pickers read easy → hard and save 2/4/6/8/10
- [x] A set RPE that would not be saved blocks the save with a message naming the exercise and set, including in collapsed exercises and workout mode
- [x] Validation errors from the API show as readable text; PATCH returns 422, not 500
- [x] Backend and frontend test suites, type check and eslint pass; single Alembic head; ruff has no new findings (the backend already had about 230)

---

### Deploy Notes

- **Migrate before the new backend serves.** `scripts/deploy.sh` builds, stops the backend, runs `alembic upgrade head`, then starts everything. With the old order (start, then migrate), a session saved as the new "Very easy" (2) before the migration ran would have been rewritten to 8. The API is down for the length of the migration.
- **Hard-refresh open browser tabs after deploying.** The old frontend bundle looks options up as `RPE_OPTIONS[rpe - 1]`, so a session RPE of 6–10 crashes it.

### Implementation Notes

- **Migration chain.** `c3f8e1a2b9d4` sits on top of the per-set migration `c7d8e9f0a1b2`. It only touches rows with 1–5. The downgrade is exact for even values; odd values (possible only after the upgrade) round half away from zero (7 → 3, Moderate) and are clamped with `CASE`, because SQLite has no `GREATEST`/`LEAST`. Verified up/down on Postgres 16; `tests/test_migration_session_rpe.py` runs it on SQLite by binding the migration to `Operations` directly, since the full chain has Postgres-only steps.
- **Odd session values** display as the nearest emoji option, ties to the lower one (7 → Moderate), the same way the downgrade rounds.
- **Drafts.** Strength drafts below v3 and unversioned cardio drafts load with session `rpe: null`, because their 1–5 values meant the opposite. Per-set `rpe` needed no bump (a missing field loads as `''`).
- **Set RPE check.** With per-set RPE's typed input sanitised to 1–10 and chips 5–10, an invalid value mostly comes from a stored draft; the check exists so `parseSetRpe` never turns a user's value into `null` unnoticed.
