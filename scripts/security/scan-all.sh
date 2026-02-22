#!/usr/bin/env bash
set -uo pipefail

# Run all security scans and print a summary.
#
# Usage:
#   ./scripts/security/scan-all.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SCANS=(
  "Semgrep (SAST):scan-semgrep.sh"
  "Dependencies (SCA):scan-dependencies.sh"
  "Trivy (infra):scan-trivy.sh"
)

RESULTS=()
FAILED=0

echo "========================================"
echo "  Security Scan Suite"
echo "========================================"
echo ""

for scan in "${SCANS[@]}"; do
  IFS=: read -r label script <<< "${scan}"

  echo "────────────────────────────────────────"
  echo "  ${label}"
  echo "────────────────────────────────────────"
  echo ""

  if "${SCRIPT_DIR}/${script}"; then
    RESULTS+=("  ${label}  ✓ passed")
  else
    RESULTS+=("  ${label}  ✗ FAILED")
    FAILED=$((FAILED + 1))
  fi

  echo ""
done

echo "========================================"
echo "  Results"
echo "========================================"
for result in "${RESULTS[@]}"; do
  echo "${result}"
done
echo "========================================"

if [[ "${FAILED}" -gt 0 ]]; then
  echo "${FAILED} scan(s) failed"
  exit 1
else
  echo "All scans passed"
  exit 0
fi
