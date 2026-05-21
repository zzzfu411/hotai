#!/usr/bin/env bash
# Hot AI — Ubuntu/Debian server bootstrap
# Run as the user who will own the app (not root). Script uses sudo where needed.
set -euo pipefail

echo "==> Updating apt"
sudo apt-get update

echo "==> Installing base packages"
sudo apt-get install -y curl ca-certificates gnupg lsb-release git ufw build-essential

echo "==> Installing Node.js 20 (NodeSource)"
if ! command -v node >/dev/null || ! node -v | grep -q '^v20'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

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
sudo -u postgres psql <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hotai') THEN
    CREATE ROLE hotai LOGIN PASSWORD 'hotai';
  END IF;
END
$$;
SELECT 'CREATE DATABASE hotai OWNER hotai' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hotai')\gexec
SQL

echo "==> Installing Nginx + certbot"
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Enabling UFW (allow SSH, HTTP, HTTPS)"
sudo ufw allow OpenSSH || true
sudo ufw allow 'Nginx Full' || true
sudo ufw --force enable || true

echo ""
echo "==> Done. Next steps:"
echo "   1. Clone the repo and cd into it"
echo "   2. cp .env.example .env  (and edit: set DATABASE_URL, NEXT_PUBLIC_SITE_URL, REVALIDATE_SECRET)"
echo "   3. pnpm install"
echo "   4. pnpm db:generate && pnpm db:migrate && pnpm db:seed"
echo "   5. pnpm build"
echo "   6. mkdir -p logs && pm2 start ecosystem.config.js && pm2 save"
echo "   7. pm2 startup   (copy/paste the command it prints, run it with sudo)"
echo "   8. Edit deploy/nginx.conf: replace YOUR_DOMAIN, copy to /etc/nginx/sites-available/hotai, symlink, reload"
echo "   9. sudo certbot --nginx -d your-domain.com"
