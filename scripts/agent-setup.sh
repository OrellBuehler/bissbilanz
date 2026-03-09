#!/usr/bin/env bash
set -euo pipefail

apt-get update -qq
apt-get install -y --no-install-recommends \
  curl git unzip ca-certificates python3 python3-pip jq gnupg lsb-release \
  postgresql-client

# Bun
if ! command -v bun &>/dev/null; then
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

# GitHub CLI
if ! command -v gh &>/dev/null; then
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list >/dev/null
  apt-get update -qq
  apt-get install -y gh
fi

# Playwright system dependencies + Chromium browser
bunx playwright install --with-deps chromium || echo "WARNING: Playwright browser install failed — run 'bunx playwright install --with-deps chromium' manually"

# Semgrep
if ! command -v semgrep &>/dev/null; then
  pip3 install --break-system-packages semgrep 2>/dev/null || pip3 install semgrep
fi
