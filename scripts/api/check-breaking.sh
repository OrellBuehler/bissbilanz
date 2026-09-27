#!/usr/bin/env bash
# Fails when docs/openapi.json (REST) or docs/mcp-tools.json (MCP tools) break
# clients relative to a base ref. Both files must be regenerated first
# (`bun run api:generate`, `bun run mcp:generate`).
#
# Usage: scripts/api/check-breaking.sh [base-ref]   (default: origin/main)
# ALLOW_BREAKING=1 reports breaking changes without failing (CI sets it when the
# PR carries the `api-breaking-change` label).
set -euo pipefail

BASE_REF="${1:-origin/main}"
OASDIFF_IMAGE="tufin/oasdiff:v1.32.1@sha256:3b14fe0112e5d1bf862f91ab234a4bcd161a3f399e98f8b0b665ce70857694ac"
SPECS=(docs/openapi.json docs/mcp-tools.json)

cd "$(git rev-parse --show-toplevel)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

summary() {
	if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$1" >>"$GITHUB_STEP_SUMMARY"; fi
}

oasdiff() {
	docker run --rm -v "$WORK_DIR:/w:ro" "$OASDIFF_IMAGE" "$@"
}

failed=0
for spec in "${SPECS[@]}"; do
	name="$(basename "$spec" .json)"
	if ! git cat-file -e "$BASE_REF:$spec" 2>/dev/null; then
		echo "$spec: not present on $BASE_REF, skipping"
		continue
	fi
	git show "$BASE_REF:$spec" >"$WORK_DIR/$name.base.json"
	cp "$spec" "$WORK_DIR/$name.head.json"

	changelog="$(oasdiff changelog "/w/$name.base.json" "/w/$name.head.json" --format text)"
	summary "### $spec"
	summary '```'
	summary "${changelog:-No changes detected}"
	summary '```'

	echo "== $spec vs $BASE_REF"
	if ! oasdiff breaking "/w/$name.base.json" "/w/$name.head.json" --fail-on ERR; then
		failed=1
	fi
done

if [ "$failed" -eq 1 ]; then
	if [ "${ALLOW_BREAKING:-}" = "1" ]; then
		echo "::warning::Breaking API changes allowed by the api-breaking-change label"
		summary "**Breaking changes present — allowed by the \`api-breaking-change\` label.**"
		exit 0
	fi
	cat <<'MSG'

Breaking API change detected. Old app builds in the wild will break against this server.
Make the change additive instead (see docs/api-stability.md): new optional fields, new
endpoints, deprecate before removing. If the break is intentional and every supported
client has been migrated, add the `api-breaking-change` label to the PR with a
justification in the description.
MSG
	exit 1
fi
echo "No breaking API changes."
