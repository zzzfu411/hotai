#!/usr/bin/env bash
# Hot AI — Ubuntu/Debian server bootstrap
# Run as the user who will own the app (not root). Script uses sudo where needed.
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PASSWORD_FILE="$APP_DIR/.db-password"
umask 077

echo "==> Updating apt"
sudo apt-get update

echo "==> Installing base packages"
sudo apt-get install -y curl ca-certificates gnupg lsb-release git ufw build-essential openssl

echo "==> Installing Node.js 22 LTS (minimum 22.22.2)"
if ! command -v node >/dev/null || ! node -e 'const [a,b,c]=process.versions.node.split(".").map(Number); process.exit(a===22 && (b>22 || (b===22 && c>=2)) ? 0 : 1)'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -e 'const [a,b,c]=process.versions.node.split(".").map(Number); if (!(a===22 && (b>22 || (b===22 && c>=2)))) { console.error("Node.js 22.22.2+ is required"); process.exit(1); }'

echo "==> Activating pnpm via corepack (pinned by packageManager field)"
sudo corepack enable
# corepack reads "packageManager": "pnpm@9.12.0" from package.json on first run
# inside the repo, so no explicit version pin needed here.

echo "==> Installing PM2"
if ! command -v pm2 >/dev/null; then
  sudo npm install -g pm2
fi

echo "==> Installing PostgreSQL"
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

echo "==> Creating DB role + database (idempotent)"
if [[ -s "$DB_PASSWORD_FILE" ]]; then
  DB_PASSWORD="$(<"$DB_PASSWORD_FILE")"
else
  DB_PASSWORD="$(openssl rand -hex 32)"
  printf '%s\n' "$DB_PASSWORD" >"$DB_PASSWORD_FILE"
  chmod 600 "$DB_PASSWORD_FILE"
fi
if [[ ! "$DB_PASSWORD" =~ ^[[:xdigit:]]{64}$ ]]; then
  echo "Refusing to use an invalid $DB_PASSWORD_FILE; remove it and rerun setup.sh." >&2
  exit 1
fi

# The generated password is hex-only, so it is safe to pass as a single SQL
# literal after shell quoting. Reusing the file keeps reruns idempotent while
# avoiding a fixed or printed production credential.
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'hotai'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE hotai WITH LOGIN PASSWORD '$DB_PASSWORD';"
else
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE hotai LOGIN PASSWORD '$DB_PASSWORD';"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'hotai'" | grep -q 1; then
  sudo -u postgres createdb -O hotai hotai
fi

if [[ -f "$APP_DIR/.env" ]]; then
  chmod 600 "$APP_DIR/.env"
fi

echo "==> Installing Nginx + certbot"
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Enabling UFW (allow SSH, HTTP, HTTPS)"
sudo ufw allow OpenSSH || true
sudo ufw allow 'Nginx Full' || true
sudo ufw --force enable || true

echo ""
echo "==> Done. Next steps:"
echo "   1. Clone the repo and cd into it"
echo "   2. cp .env.example .env && chmod 600 .env  (set DATABASE_URL using the generated .db-password)"
echo "   3. pnpm install"
echo "   4. pnpm db:generate && pnpm db:migrate && pnpm db:seed"
echo "   5. pnpm build"
echo "   6. mkdir -p logs && pm2 start ecosystem.config.js && pm2 save"
echo "   7. pm2 startup   (copy/paste the command it prints, run it with sudo)"
echo "   8. sudo cp deploy/nginx.conf /etc/nginx/sites-available/hotai && sudo ln -sf /etc/nginx/sites-available/hotai /etc/nginx/sites-enabled/hotai && sudo nginx -t && sudo systemctl reload nginx"
echo "   9. sudo certbot --nginx -d hotai.yeuxark.com"
echo "  10. sudo cp deploy/nginx-https.conf /etc/nginx/sites-available/hotai && sudo nginx -t && sudo systemctl reload nginx"
