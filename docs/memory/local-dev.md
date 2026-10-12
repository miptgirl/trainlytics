Local dev stack: pnpm runs via corepack, backend runs the working tree (restart it after edits), migrations are applied by hand.

- `pnpm` isn't on PATH; use `corepack pnpm test|lint|build` in `frontend/`.
- `docker compose up -d` mounts `./backend` into the backend container with `--reload`, so it runs whatever branch is checked out. `--reload` may not fire when the container runs in a VM (file events don't cross the bind mount); if an endpoint still behaves like the old code, `docker compose restart backend`. The frontend container serves a built bundle; rebuild it with `docker compose up -d --build frontend` to see frontend changes.
- Nothing runs Alembic on startup. After adding a migration, apply it to the local Postgres with `docker compose exec -T backend uv run alembic upgrade head`; otherwise endpoints that select the new column return 500.
- Backend tests build the schema with `create_all` on SQLite, so they never execute migrations. Add a dedicated migration test (see `backend/tests/test_migration_*.py`) and do an upgrade/downgrade round-trip on the local Postgres.
- Demo login for UI checks: `demo` / `demo` (seed with `scripts/seed-demo.sh`).
