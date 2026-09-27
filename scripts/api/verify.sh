#!/usr/bin/env bash
# The API stability gate, run by .github/workflows/api-contract.yml and locally
# before opening a PR that touches routes, validation schemas, MCP tools or
# migrations. Needs Docker (Kotlin codegen + oasdiff).
#
# Usage: scripts/api/verify.sh [base-ref]   (default: origin/main)
set -euo pipefail

BASE_REF="${1:-origin/main}"
GENERATED=(
	docs/openapi.json
	docs/mcp-tools.json
	src/lib/api/generated
	mobile/shared/src/commonMain/kotlin/com/bissbilanz/api/generated
)

cd "$(git rev-parse --show-toplevel)"

echo "== Regenerating the OpenAPI spec, TS + Kotlin clients and the MCP snapshot"
bun run api:generate
bun run mcp:generate
bunx prettier --write docs/openapi.json docs/mcp-tools.json src/lib/api/generated >/dev/null

if [ -n "$(git status --porcelain -- "${GENERATED[@]}")" ]; then
	git status --short -- "${GENERATED[@]}"
	echo "::error::Generated API artifacts are stale. Run scripts/api/verify.sh locally and commit the result."
	exit 1
fi

echo "== Breaking-change check"
scripts/api/check-breaking.sh "$BASE_REF"

echo "== Destructive-migration check"
scripts/api/check-migrations.sh "$BASE_REF"
