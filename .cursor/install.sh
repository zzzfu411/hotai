#!/usr/bin/env bash
# Idempotent Cloud Agent install: prepares PostgreSQL, the .env file, JS
# dependencies, the Prisma client, the compiled runtime packages, and the
# database schema + seed data. Safe to run repeatedly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PG_VERSION=16

# 1. Ensure PostgreSQL is installed. The base snapshot normally already has it;
#    this guard keeps the environment usable from a plain default image too.
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  echo "[install] Installing PostgreSQL ${PG_VERSION}..."
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
  PG_VERSION="$(ls /etc/postgresql | sort -V | tail -1)"
fi

# 2. Start the cluster (idempotent) and wait until it accepts connections.
sudo pg_ctlcluster "${PG_VERSION}" main start 2>/dev/null || true
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q 2>/dev/null; then break; fi
  sleep 1
done

# 3. Ensure the application role and database exist.
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hotai') THEN
    CREATE ROLE hotai LOGIN PASSWORD 'hotai';
  END IF;
END $$;
SQL
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='hotai'" | grep -q 1 \
  || sudo -u postgres createdb -O hotai hotai

# 4. Ensure a local .env exists (never overwrite a user-edited one).
#    AI features stay disabled unless the user adds an Anthropic key.
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i 's#postgresql://hotai:DB_PASSWORD@localhost:5432/hotai?schema=public#postgresql://hotai:hotai@localhost:5432/hotai?schema=public#' .env
fi

# 5. JS dependencies, Prisma client, and compiled runtime packages
#    (@hotai/db, @hotai/ai, @hotai/fetcher resolve to their dist/ output).
corepack pnpm install --frozen-lockfile
corepack pnpm db:generate
corepack pnpm build:runtime

# 6. Apply committed migrations and seed the Source table (both idempotent).
corepack pnpm db:migrate
corepack pnpm db:seed

echo "[install] Done."
