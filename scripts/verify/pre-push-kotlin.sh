#!/usr/bin/env bash
# Pre-push: run ktlint for the mobile Gradle modules whose Kotlin changed vs the
# merge-base with origin/main. Skips (exit 0) when Gradle/JDK/Android SDK are not
# available so pushing from a machine without the mobile toolchain still works.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 1

base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main 2>/dev/null || echo HEAD)
changed=$(git diff --name-only --diff-filter=d "$base" -- 'mobile/*.kt' 'mobile/*.kts' | grep -v '/generated/' || true)

if [ -z "$changed" ]; then
	exit 0
fi

modules=()
for m in shared androidApp wearApp wearProtocol; do
	if grep -q "^mobile/$m/" <<<"$changed"; then
		modules+=(":$m:ktlintCheck")
	fi
done
# build-logic or root script changes affect every module
if grep -qvE '^mobile/(shared|androidApp|wearApp|wearProtocol)/' <<<"$changed"; then
	modules=(":shared:ktlintCheck" ":androidApp:ktlintCheck" ":wearApp:ktlintCheck" ":wearProtocol:ktlintCheck")
fi

if [ ! -x mobile/gradlew ]; then
	echo "pre-push ktlint: mobile/gradlew missing, skipping"
	exit 0
fi

if ! command -v java >/dev/null 2>&1 && [ -f "$HOME/.sdkman/bin/sdkman-init.sh" ]; then
	# shellcheck disable=SC1091
	source "$HOME/.sdkman/bin/sdkman-init.sh" >/dev/null 2>&1 || true
fi
if ! command -v java >/dev/null 2>&1; then
	echo "pre-push ktlint: no JDK found, skipping (Kotlin changed: ${modules[*]})"
	exit 0
fi

if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/android-sdk" ]; then
	export ANDROID_HOME="$HOME/android-sdk"
fi
if [ -z "${ANDROID_HOME:-}" ]; then
	echo "pre-push ktlint: ANDROID_HOME not set and ~/android-sdk missing, skipping (Kotlin changed: ${modules[*]})"
	exit 0
fi

echo "pre-push ktlint: ${modules[*]}"
cd mobile && ./gradlew --console=plain -q "${modules[@]}"
