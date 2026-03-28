#!/usr/bin/env bash
set -euo pipefail

# Trivy security scan — filesystem vulnerability/secret/misconfig scan and IaC config scan.
# Optionally builds and scans the Docker image with --images flag.
#
# Usage:
#   ./scripts/security/scan-trivy.sh              # filesystem + IaC scans
#   ./scripts/security/scan-trivy.sh --images      # also build and scan Docker image

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if ! command -v trivy &>/dev/null; then
  echo "ERROR: trivy is not installed." >&2
  echo "Run ./scripts/security/install-tools.sh or visit: https://aquasecurity.github.io/trivy/" >&2
  exit 1
fi

SCAN_IMAGES=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --images) SCAN_IMAGES=true; shift ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--images]" >&2
      exit 1
      ;;
  esac
done

EXIT_CODE=0

# ── Filesystem scan ─────────────────────────────────────────────────────────────

echo "=== Trivy filesystem scan ==="
if ! trivy fs "${REPO_ROOT}" \
    --scanners vuln,secret,misconfig \
    --severity CRITICAL,HIGH \
    --skip-dirs node_modules \
    --skip-dirs .svelte-kit \
    --skip-dirs .worktrees \
    --exit-code 1; then
  EXIT_CODE=1
fi

# ── IaC config scan ────────────────────────────────────────────────────────────

echo ""
echo "=== Trivy IaC config scan ==="
if ! trivy config "${REPO_ROOT}" \
    --severity CRITICAL,HIGH \
    --skip-dirs node_modules \
    --skip-dirs .svelte-kit \
    --skip-dirs .worktrees \
    --exit-code 1; then
  EXIT_CODE=1
fi

# ── Docker image scan (optional) ───────────────────────────────────────────────

if [[ "${SCAN_IMAGES}" == "true" ]]; then
  if ! command -v docker &>/dev/null; then
    echo ""
    echo "WARNING: docker not found, skipping image scan" >&2
  else
    echo ""
    echo "=== Building and scanning Docker image: bissbilanz ==="
    if docker build -t "bissbilanz:scan" -f "${REPO_ROOT}/Dockerfile" "${REPO_ROOT}" --quiet; then
      if ! trivy image "bissbilanz:scan" \
          --severity CRITICAL,HIGH \
          --exit-code 1; then
        EXIT_CODE=1
      fi
    else
      echo "WARNING: failed to build image, skipping scan" >&2
    fi
  fi
fi

exit "${EXIT_CODE}"
