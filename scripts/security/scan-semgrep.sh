#!/usr/bin/env bash
set -euo pipefail

# Semgrep SAST scan — runs open-source rulesets for JavaScript, TypeScript,
# Docker, secrets, and OWASP top 10 against the repository.
#
# Usage:
#   ./scripts/security/scan-semgrep.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if ! command -v semgrep &>/dev/null; then
  echo "ERROR: semgrep is not installed." >&2
  echo "Run ./scripts/security/install-tools.sh or: pip install semgrep" >&2
  exit 1
fi

echo "Running Semgrep SAST scan..."
echo ""

semgrep scan \
  --config "p/javascript" \
  --config "p/typescript" \
  --config "p/docker" \
  --config "p/secrets" \
  --config "p/owasp-top-ten" \
  --exclude "node_modules" \
  --exclude ".svelte-kit" \
  --exclude "*.lock" \
  --exclude "src/lib/paraglide" \
  --error \
  --severity ERROR --severity WARNING \
  "${REPO_ROOT}"
