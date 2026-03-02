#!/bin/bash
set -euo pipefail

echo "=== Bissbilanz Devcontainer Setup ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

export DEBIAN_FRONTEND=noninteractive

# --- System packages ---
echo "Installing system packages..."
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
    curl unzip ca-certificates gnupg lsb-release \
    postgresql postgresql-client \
    > /dev/null
ok "system packages installed"

# --- Bun ---
echo "Installing bun..."
if command -v bun &>/dev/null; then
    ok "bun $(bun --version) already installed"
else
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    # Make bun available in future shells
    if ! grep -q 'BUN_INSTALL' "$HOME/.bashrc" 2>/dev/null; then
        echo 'export BUN_INSTALL="$HOME/.bun"' >> "$HOME/.bashrc"
        echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> "$HOME/.bashrc"
    fi
    ok "bun installed"
fi

# --- PostgreSQL setup ---
echo "Setting up PostgreSQL..."
pg_ctlcluster $(pg_lsclusters -h | head -1 | awk '{print $1, $2}') start 2>/dev/null || true

DB_USER="bissbilanz"
DB_PASS="bissbilanz"
DB_NAME="bissbilanz"

su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'\" | grep -q 1 || psql -c \"CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';\"" 2>/dev/null
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\" | grep -q 1 || psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER;\"" 2>/dev/null
ok "PostgreSQL running — database '$DB_NAME' ready"

# --- .env file ---
echo "Setting up .env..."
if [ -f .env ]; then
    ok ".env already exists"
else
    cp .env.example .env
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgres://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME|" .env
    sed -i "s|SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 32)|" .env
    ok ".env created with local database config"
fi

# --- Install dependencies ---
echo "Installing project dependencies..."
bun install
ok "dependencies installed"

# --- Playwright ---
echo "Installing Playwright browsers..."
bunx playwright install --with-deps chromium
ok "Playwright chromium installed"

# --- Database migrations ---
echo "Running database migrations..."
bun run db:migrate
ok "migrations applied"

# --- Summary ---
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Ready to go:"
echo "  bun run dev        # start dev server"
echo "  bun test           # run tests"
echo "  bun run check      # type check"
echo ""
echo "Edit .env to add your Infomaniak OIDC credentials for auth."
echo ""
