#!/bin/bash
set -euo pipefail

echo "=== Bissbilanz Development Setup ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }

# --- Bun ---
echo "Checking bun..."
if command -v bun &>/dev/null; then
    ok "bun $(bun --version) already installed"
else
    echo "Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    ok "bun installed"
fi

# --- PostgreSQL client ---
echo "Checking PostgreSQL..."
if command -v psql &>/dev/null; then
    ok "psql already installed"
else
    warn "psql not found — install PostgreSQL client:"
    echo "    sudo apt install postgresql-client"
fi

# --- Check PostgreSQL connection ---
echo "Checking database connectivity..."
if [ -f .env ]; then
    DB_URL=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)
    if [ -n "$DB_URL" ]; then
        if psql "$DB_URL" -c "SELECT 1" &>/dev/null 2>&1; then
            ok "database reachable"
        else
            warn "database not reachable at configured DATABASE_URL"
        fi
    fi
else
    warn "no .env file found (will create from template below)"
fi

# --- .env file ---
echo "Checking .env..."
if [ -f .env ]; then
    ok ".env exists"
else
    cp .env.example .env
    ok ".env created from .env.example — edit it with your credentials"
fi

# --- Install dependencies ---
echo "Installing dependencies..."
bun install
ok "dependencies installed"

# --- Generate Drizzle migrations (if schema exists but no migrations) ---
echo "Checking database migrations..."
if [ -d drizzle ]; then
    ok "drizzle migrations directory exists"
else
    warn "no drizzle directory — run 'bun run db:generate' after configuring your database"
fi

# --- Summary ---
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit .env with your database URL and OIDC credentials"
echo "  2. Start a PostgreSQL instance (or use an existing one)"
echo "  3. Run 'bun run dev' — migrations apply automatically on startup"
echo ""
