#!/usr/bin/env bash
# Run all tests with process isolation between categories.
#
# Bun's mock.module() is process-global: a mock registered in one test file
# replaces the module for ALL files in the same process. This means API tests
# (which mock service modules like $lib/server/foods) pollute server tests
# (which need the real implementations). Running each category in its own
# process eliminates this cross-category interference.
#
# Within each category, all mocks are complete (every export provided) so
# files within the same category can safely share a process.

set -euo pipefail

# Forward arguments directly to bun test for single-suite runs
if [ "$#" -gt 0 ]; then
  bun test "$@"
  exit $?
fi

failed=0

run_suite() {
  local label="$1"
  shift
  printf "\n\033[1m▸ %s\033[0m\n" "$label"
  if bun test "$@"; then
    printf "\033[32m  ✓ %s passed\033[0m\n" "$label"
  else
    printf "\033[31m  ✗ %s failed\033[0m\n" "$label"
    failed=1
  fi
}

run_suite "Server tests"      tests/server/
run_suite "Utils tests"        tests/utils/
run_suite "API tests"          tests/api/
run_suite "Integration tests"  tests/integration/

echo ""
if [ "$failed" -eq 0 ]; then
  printf "\033[32m✓ All test suites passed\033[0m\n"
else
  printf "\033[31m✗ Some test suites failed\033[0m\n"
  exit 1
fi
