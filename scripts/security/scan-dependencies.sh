#!/usr/bin/env bash
set -euo pipefail

# Dependency vulnerability audit using bun audit.
# Fails on high or critical severity vulnerabilities.
#
# Accepted exceptions live in .trivyignore (single source of truth, shared
# with Trivy). Lines starting with CVE- or GHSA- are treated as accepted
# advisory ids; bun audit findings referencing an accepted GHSA id are
# filtered out before the severity gate.
#
# Usage:
#   ./scripts/security/scan-dependencies.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IGNORE_FILE="${REPO_ROOT}/.trivyignore"

EXIT_CODE=0

echo "Running dependency audit..."
echo ""

KNOWN_ACCEPTED=()
if [[ -f "${IGNORE_FILE}" ]]; then
  while IFS= read -r line; do
    line="${line%%#*}"
    line="$(echo "${line}" | tr -d '[:space:]')"
    if [[ "${line}" == CVE-* || "${line}" == GHSA-* ]]; then
      KNOWN_ACCEPTED+=("${line}")
    fi
  done < "${IGNORE_FILE}"
  echo "Accepted exceptions from .trivyignore: ${#KNOWN_ACCEPTED[@]}"
  echo ""
fi

echo "=== bun audit ==="
if [[ -f "${REPO_ROOT}/bun.lock" ]]; then
  AUDIT_OUTPUT=$(cd "${REPO_ROOT}" && bun audit --audit-level=high 2>&1) || true

  FILTERED_OUTPUT="${AUDIT_OUTPUT}"
  if ((${#KNOWN_ACCEPTED[@]} > 0)); then
    for advisory in "${KNOWN_ACCEPTED[@]}"; do
      FILTERED_OUTPUT=$(echo "${FILTERED_OUTPUT}" | grep -v "${advisory}" || true)
    done
  fi

  if echo "${FILTERED_OUTPUT}" | grep -qE '^\s+(high|critical):'; then
    echo "${AUDIT_OUTPUT}"
    echo ""
    echo "Vulnerabilities found at high or critical level"
    EXIT_CODE=1
  else
    echo "${AUDIT_OUTPUT}"
    echo ""
    echo "No unaccepted high/critical vulnerabilities"
  fi
else
  echo "bun.lock not found, skipping"
fi

exit "${EXIT_CODE}"
