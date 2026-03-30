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

KNOWN_ACCEPTED=(
  "GHSA-q5qw-h33p-qvwr"  # hono serveStatic — we don't use serveStatic
  "GHSA-c2c7-rcm5-vvqj"  # picomatch ReDoS — transitive via vite/vitest, no upstream fix
  "GHSA-wmrf-hv6w-mr66"   # kysely SQL injection — transitive via @inlang/sdk, not used directly
  "GHSA-8cpq-38p9-67gx"   # kysely MySQL injection — transitive via @inlang/sdk, we use PostgreSQL
  "GHSA-3ppc-4f35-3m26"   # minimatch ReDoS — transitive via workbox-build/sentry/etc
  "GHSA-7r86-cg39-jmmj"   # minimatch ReDoS — transitive via workbox-build/sentry/etc
  "GHSA-23c5-xmqv-rm74"   # minimatch ReDoS — transitive via workbox-build/sentry/etc
  "GHSA-5c6j-r48x-rmvq"   # serialize-javascript RCE — transitive via @rollup/plugin-terser
  "GHSA-38f7-945m-qr2g"   # effect AsyncLocalStorage — transitive, not used directly
  "GHSA-46wh-pxpv-q5gq"   # express-rate-limit IPv6 bypass — transitive via MCP SDK
  "GHSA-j3q9-mxjg-w52f"   # path-to-regexp DoS — transitive via express
)

echo "=== bun audit ==="
if [[ -f "${REPO_ROOT}/bun.lock" ]]; then
  AUDIT_OUTPUT=$(cd "${REPO_ROOT}" && bun audit --audit-level=high 2>&1) || true

  FILTERED_OUTPUT="${AUDIT_OUTPUT}"
  for advisory in "${KNOWN_ACCEPTED[@]}"; do
    FILTERED_OUTPUT=$(echo "${FILTERED_OUTPUT}" | grep -v "${advisory}" || true)
  done

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
