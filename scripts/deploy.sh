#!/usr/bin/env bash
set -euo pipefail

# Ensure .env exists before doing anything else
if [ ! -f .env ]; then
  echo "Error: .env file not found in $(pwd)"
  echo "Create a .env file with SECRET_KEY and USERS before deploying."
  echo "See README.md → Deployment for instructions."
  exit 1
fi

git pull
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml exec backend uv run alembic upgrade head
echo "Deploy complete."
