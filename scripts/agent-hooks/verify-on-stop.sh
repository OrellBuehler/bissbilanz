#!/usr/bin/env bash
# Stop / SubagentStop hook: run `bun run verify:changed` and, on failure, exit 2
# with the output on stderr so the agent keeps working on the failures.

input=$(cat)

if command -v jq >/dev/null 2>&1; then
  active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)
else
  active=$(printf '%s' "$input" | bun -e 'const d = JSON.parse(await Bun.stdin.text()); console.log(d.stop_hook_active === true)' 2>/dev/null)
fi
# Already continuing because of this hook: let the agent stop instead of looping.
[ "$active" = "true" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0

[ -f package.json ] || exit 0
grep -q '"verify:changed"' package.json || exit 0

# Nothing changed in the working tree or relative to main: nothing to verify.
if [ -z "$(git status --porcelain 2>/dev/null)" ] &&
  [ -z "$(git diff --name-only origin/main...HEAD 2>/dev/null)" ]; then
  exit 0
fi

output=$(bun run verify:changed 2>&1)
status=$?
if [ "$status" -ne 0 ]; then
  {
    echo "bun run verify:changed failed (exit $status). Fix these before finishing:"
    printf '%s\n' "$output" | tail -n 120
  } >&2
  exit 2
fi

exit 0
