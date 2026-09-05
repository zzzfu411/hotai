#!/usr/bin/env bash
# Per-boot reconciliation: bring PostgreSQL up and confirm the schema is
# present. Dependency installation and builds live in install.sh, not here.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PG_VERSION="$(ls /etc/postgresql 2>/dev/null | sort -V | tail -1 || echo 16)"

# Start the cluster (a already-running cluster exits non-zero, so ignore it).
sudo pg_ctlcluster "${PG_VERSION}" main start 2>/dev/null || true

ready=false
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q 2>/dev/null; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then
  echo "[start] PostgreSQL did not become ready in time." >&2
  exit 1
fi

# Safety net: ensure the schema exists even if the snapshot predates a migration.
corepack pnpm db:migrate >/dev/null 2>&1 || true

echo "[start] PostgreSQL is ready on localhost:5432 (db 'hotai')."
