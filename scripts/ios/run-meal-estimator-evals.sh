#!/usr/bin/env bash
set -euo pipefail

# Runs the MealEstimator evaluation suite (Evaluations framework, WWDC26)
# against the real, on-device Foundation Models session.
#
# This does NOT run in CI: GitHub's macOS runners are virtualized and have no
# Apple Intelligence, so `SystemLanguageModel.default.availability` reports
# `.unavailable` there and MealEstimatorEvaluationTests.evaluated() is skipped
# (`.enabled(if:)`), not failed — see that test's header comment. Everything
# deterministic around it (the hallucination guard, result mapping, tolerance
# scoring, fixture-data sanity) still runs in CI as ordinary unit tests.
#
# Requirements to actually run this:
#   - A Mac signed into an Apple Account with Apple Intelligence turned on
#     (Settings > Apple Intelligence & Siri), for a supported device/region.
#   - Xcode 27+ / a simulator running iOS 27+ (the Evaluations framework and
#     AppIntentsTesting are both new in iOS 27.0 — see MealEstimationEvaluation.swift).
#   - The simulator inherits the host Mac's Apple Intelligence eligibility —
#     no separate sign-in needed, but the FIRST run downloads the model, which
#     can take a while.
#
# Usage:
#   ./scripts/ios/run-meal-estimator-evals.sh
#
# Opens the resulting .xcresult afterwards; in Xcode, select "Evaluations" in
# the Report navigator's test run for the per-sample breakdown (prompt,
# response, every metric, and any model-judge rationale).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IOS_APP_DIR="${REPO_ROOT}/mobile/iosApp"
RESULT_BUNDLE="${IOS_APP_DIR}/MealEstimatorEvals.xcresult"

if ! command -v xcodegen &>/dev/null; then
  echo "ERROR: xcodegen is not installed. Run: brew install xcodegen" >&2
  exit 1
fi

echo "Generating Xcode project..."
(cd "${IOS_APP_DIR}" && xcodegen generate)

DEVICE_ID=$(xcrun simctl list devices available --json | jq -r '
  [.devices | to_entries[]
   | select(.key | test("iOS"))
   | .value[]
   | select(.name | startswith("iPhone"))
   | .udid] | last')

if [[ -z "${DEVICE_ID}" || "${DEVICE_ID}" == "null" ]]; then
  echo "ERROR: no iPhone simulator available. Install an iOS 27+ simulator runtime in Xcode > Settings > Platforms." >&2
  exit 1
fi

rm -rf "${RESULT_BUNDLE}"

echo "Running MealEstimatorEvaluationTests.evaluated() on device ${DEVICE_ID}..."
(cd "${IOS_APP_DIR}" && xcodebuild test \
  -project Bissbilanz.xcodeproj \
  -scheme Bissbilanz \
  -destination "id=${DEVICE_ID}" \
  -configuration Debug \
  -only-testing:BissbilanzTests/MealEstimatorEvaluationTests/evaluated \
  -resultBundlePath "${RESULT_BUNDLE}" \
  CODE_SIGNING_ALLOWED=NO)

echo "Done. Opening the result bundle..."
open "${RESULT_BUNDLE}"
