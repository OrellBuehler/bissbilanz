#!/usr/bin/env bash
# Flags destructive SQL in migrations added since a base ref. Destructive steps
# break rollback to the previous image and can lose data; ship them only in the
# "contract" phase, after no deployed code reads the old shape
# (docs/api-stability.md). Acknowledge a reviewed one by adding a line
#   -- destructive-ok: <reason>
# to the migration file.
#
# Usage: scripts/api/check-migrations.sh [base-ref]   (default: origin/main)
set -euo pipefail

BASE_REF="${1:-origin/main}"
PATTERN='DROP[[:space:]]+(TABLE|COLUMN|TYPE|SCHEMA)|RENAME[[:space:]]+(TO|COLUMN|CONSTRAINT)|SET[[:space:]]+DATA[[:space:]]+TYPE|ALTER[[:space:]]+COLUMN[^;]*[[:space:]]TYPE[[:space:]]|SET[[:space:]]+NOT[[:space:]]+NULL|TRUNCATE|DELETE[[:space:]]+FROM'

cd "$(git rev-parse --show-toplevel)"
failed=0
while IFS= read -r file; do
	[ -n "$file" ] || continue
	hits="$(grep -nEi "$PATTERN" "$file" || true)"
	[ -n "$hits" ] || continue
	if grep -qE '^--[[:space:]]*destructive-ok:[[:space:]]*[^[:space:]]' "$file"; then
		echo "$file: destructive statements acknowledged"
		continue
	fi
	echo "::error file=$file::Destructive migration without a '-- destructive-ok: <reason>' line"
	echo "$hits"
	failed=1
done < <(
	git diff --name-only --diff-filter=A "$(git merge-base "$BASE_REF" HEAD)" -- 'drizzle/*.sql'
	git ls-files --others --exclude-standard -- 'drizzle/*.sql'
)

if [ "$failed" -eq 1 ]; then
	cat <<'MSG'

Destructive migration detected. Prefer expand/contract: add the new column/table,
dual-write, backfill, switch reads, and drop the old one in a later release. If this
drop is the contract step, add `-- destructive-ok: <reason>` to the migration file.
MSG
	exit 1
fi
echo "No unacknowledged destructive migrations."
