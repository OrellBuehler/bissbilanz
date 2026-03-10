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

# SDKMAN + Java 17 (for Android/KMP builds)
if [ ! -d "$HOME/.sdkman" ]; then
  curl -fsSL https://get.sdkman.io | bash
fi
# shellcheck source=/dev/null
source "$HOME/.sdkman/bin/sdkman-init.sh"
if ! java -version 2>&1 | grep -q '"17'; then
  sdk install java 17.0.13-tem
fi

# Android SDK command-line tools
export ANDROID_HOME="$HOME/android-sdk"
if [ ! -d "$ANDROID_HOME/cmdline-tools" ]; then
  mkdir -p "$ANDROID_HOME"
  curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" -o /tmp/cmdline-tools.zip
  unzip -q /tmp/cmdline-tools.zip -d "$ANDROID_HOME/cmdline-tools-tmp"
  mkdir -p "$ANDROID_HOME/cmdline-tools/latest"
  mv "$ANDROID_HOME/cmdline-tools-tmp/cmdline-tools/"* "$ANDROID_HOME/cmdline-tools/latest/"
  rm -rf "$ANDROID_HOME/cmdline-tools-tmp" /tmp/cmdline-tools.zip
  yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null 2>&1 || true
  "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "platforms;android-34" "build-tools;34.0.0"
fi

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
