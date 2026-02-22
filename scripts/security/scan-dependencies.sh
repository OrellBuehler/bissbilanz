#!/usr/bin/env bash
set -euo pipefail

# Dependency vulnerability audit using bun audit.
# Fails on high or critical severity vulnerabilities.
#
# Usage:
#   ./scripts/security/scan-dependencies.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

EXIT_CODE=0

echo "Running dependency audit..."
echo ""

echo "=== bun audit ==="
if [[ -f "${REPO_ROOT}/bun.lock" ]]; then
  if ! (cd "${REPO_ROOT}" && bun audit --audit-level=high); then
    echo ""
    echo "Vulnerabilities found at high or critical level"
    EXIT_CODE=1
  else
    echo "No high/critical vulnerabilities"
  fi
else
  echo "bun.lock not found, skipping"
fi

exit "${EXIT_CODE}"
