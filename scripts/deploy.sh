#!/usr/bin/env bash
set -euo pipefail

# Ensure .env exists before doing anything else
if [ ! -f .env ]; then
  echo "Error: .env file not found in $(pwd)"
  echo "Create a .env file with SECRET_KEY and USERS before deploying."
  echo "See README.md → Deployment for instructions."
  exit 1
fi

compose=(docker compose -f docker-compose.prod.yml)

git pull
"${compose[@]}" build

# Migrate while no backend is serving, so new code never writes rows that a
# pending data migration then rewrites (and old code never meets the new
# schema). The API is down from here until `up -d`; the frontend keeps serving.
"${compose[@]}" stop backend

# `run` uses the service's env_file, environment (DATABASE_URL) and waits for a
# healthy db via depends_on. If the migration fails, `set -e` exits here and the
# backend stays stopped: the safe failure. Fix the problem and run this again.
"${compose[@]}" run --rm backend uv run alembic upgrade head

"${compose[@]}" up -d
echo "Deploy complete."
