#!/usr/bin/env bash
set -euo pipefail

# Ensure .env exists before doing anything else
if [ ! -f .env ]; then
  echo "Error: .env file not found in $(pwd)"
  echo "Create a .env file with SECRET_KEY and USERS before deploying."
  echo "See README.md → Deployment for instructions."
  exit 1
fi

# Bash keeps running the script it started with, so changes that `git pull`
# brings to this file would only apply from the next deploy. Pull, then restart
# once with the updated script (same arguments and working directory). The
# marker is an argument, not an env var, so nothing inherited can skip the pull.
if [ "${1:-}" = "--after-pull" ]; then
  shift
else
  git pull
  exec bash "$0" --after-pull "$@"
fi

compose=(docker compose -f docker-compose.prod.yml)

# --pull: never build on a stale cached base image (the frontend relies on
# nginx:alpine's 15-local-resolvers.envsh entrypoint script)
"${compose[@]}" build --pull

# Migrate while no backend is serving, so new code never writes rows that a
# pending data migration then rewrites (and old code never meets the new
# schema). The API is down from here until `up -d`; the frontend keeps serving.
# `rm` rather than `stop`: a stopped container with `restart: always` would come
# back (old code) if the host restarted mid-deploy.
"${compose[@]}" rm -sf backend

# `run` uses the service's env_file, environment (DATABASE_URL) and waits for a
# healthy db via depends_on. If the migration fails, `set -e` exits here and the
# backend stays down: the safe failure. Fix the problem and run this again.
"${compose[@]}" run --rm backend uv run alembic upgrade head

"${compose[@]}" up -d
echo "Deploy complete."
