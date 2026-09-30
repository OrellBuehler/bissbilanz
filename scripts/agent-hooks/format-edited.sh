#!/usr/bin/env bash
# PostToolUse hook (Edit|Write|MultiEdit): run prettier on the edited file only.
# Never fails the tool call: every problem ends in exit 0.

input=$(cat)

if command -v jq >/dev/null 2>&1; then
  file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
else
  file=$(printf '%s' "$input" | bun -e 'const d = JSON.parse(await Bun.stdin.text()); if (d.tool_input?.file_path) console.log(d.tool_input.file_path)' 2>/dev/null)
fi
[ -n "$file" ] || exit 0

root=${CLAUDE_PROJECT_DIR:-$(pwd)}
cd "$root" 2>/dev/null || exit 0
root=$(pwd -P)

case "$file" in
  /*) abs=$file ;;
  *) abs=$root/$file ;;
esac
[ -f "$abs" ] || exit 0
abs=$(cd "$(dirname "$abs")" 2>/dev/null && printf '%s/%s' "$(pwd -P)" "$(basename "$abs")") || exit 0

case "$abs" in
  "$root"/*) ;;
  *) exit 0 ;;
esac

# --ignore-unknown skips files prettier has no parser for; .prettierignore is honoured.
if [ -x node_modules/.bin/prettier ]; then
  node_modules/.bin/prettier --write --ignore-unknown --log-level silent "$abs" >/dev/null 2>&1
else
  bunx --bun prettier --write --ignore-unknown --log-level silent "$abs" >/dev/null 2>&1
fi

exit 0
