#!/usr/bin/env bash
set -euo pipefail

# Install security scanning tools for local development.
# Idempotent — safe to re-run. Detects OS (Linux/macOS).
#
# Tools installed:
#   - Semgrep (SAST + secret detection)
#   - Trivy (container/IaC scanning)
#
# Usage:
#   ./scripts/security/install-tools.sh

OS="$(uname -s)"

echo "========================================"
echo "  Security Tools Installer"
echo "========================================"
echo ""

# ── Semgrep ────────────────────────────────────────────────────────────────────

echo "--- Semgrep ---"
if command -v semgrep &>/dev/null; then
  echo "Already installed: $(semgrep --version 2>/dev/null)"
else
  case "${OS}" in
    Darwin)
      if command -v brew &>/dev/null; then
        brew install semgrep
      else
        pip3 install semgrep
      fi
      ;;
    Linux)
      pip3 install semgrep
      ;;
    *)
      echo "Unsupported OS: ${OS}. Install manually: pip3 install semgrep" >&2
      ;;
  esac
fi
echo ""

# ── Trivy ──────────────────────────────────────────────────────────────────────

echo "--- Trivy ---"
if command -v trivy &>/dev/null; then
  echo "Already installed: $(trivy --version 2>/dev/null | head -1)"
else
  case "${OS}" in
    Darwin)
      if command -v brew &>/dev/null; then
        brew install trivy
      else
        echo "Install Homebrew first, or visit: https://aquasecurity.github.io/trivy/" >&2
      fi
      ;;
    Linux)
      echo "Run the following to install Trivy:"
      echo "  curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sudo sh -s -- -b /usr/local/bin"
      ;;
    *)
      echo "Unsupported OS: ${OS}. Visit: https://aquasecurity.github.io/trivy/" >&2
      ;;
  esac
fi
echo ""

# ── Summary ────────────────────────────────────────────────────────────────────

echo "========================================"
echo "  Installed Tools"
echo "========================================"
echo "  Semgrep:  $(command -v semgrep &>/dev/null && semgrep --version 2>/dev/null || echo 'not found')"
echo "  Trivy:    $(command -v trivy &>/dev/null && trivy --version 2>/dev/null | head -1 || echo 'not found')"
echo ""
echo "Run scans: ./scripts/security/scan-all.sh"
