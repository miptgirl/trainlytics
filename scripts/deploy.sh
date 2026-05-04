#!/usr/bin/env bash
set -euo pipefail

git pull
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml exec backend uv run alembic upgrade head
echo "Deploy complete."
