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

# Java 17 (Adoptium Temurin, for Android/KMP builds)
if ! java -version 2>&1 | grep -q '"17'; then
  JAVA_URL="https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_linux_hotspot_17.0.13_11.tar.gz"
  curl -fsSL "$JAVA_URL" -o /tmp/jdk17.tar.gz
  mkdir -p /opt/java
  tar -xzf /tmp/jdk17.tar.gz -C /opt/java
  rm /tmp/jdk17.tar.gz
  ln -sf /opt/java/jdk-17.0.13+11 /opt/java/current
fi
export JAVA_HOME="/opt/java/current"
export PATH="$JAVA_HOME/bin:$PATH"

# Android SDK — Gradle downloads SDK components automatically via its own
# dependency resolution. We just need ANDROID_HOME set so Gradle knows where
# to put them. CI uses android-actions/setup-android@v3 instead.
export ANDROID_HOME="$HOME/android-sdk"
mkdir -p "$ANDROID_HOME"

# ktlint (standalone, for pre-commit hook)
if ! command -v ktlint &>/dev/null; then
  KTLINT_VERSION="1.5.0"
  curl -fsSL "https://github.com/pinterest/ktlint/releases/download/${KTLINT_VERSION}/ktlint" -o /usr/local/bin/ktlint
  chmod +x /usr/local/bin/ktlint
fi

# swiftformat (skip on non-macOS — iOS builds require macOS anyway)
if [[ "$(uname)" == "Darwin" ]] && ! command -v swiftformat &>/dev/null; then
  brew install swiftformat
fi
