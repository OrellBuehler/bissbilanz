#!/usr/bin/env bash
# Captures the Apple Watch App Store screenshots from a booted watch
# simulator. The watch app is launched once per screen with
# -store_screenshots YES, which makes a Debug build show invented demo data
# instead of waiting for a phone (see WatchScreenshotSeed.swift). The screen
# is chosen with -store_screenshot_screen, so nothing has to be tapped.
#
# Usage: store-screenshots-watch.sh <watch simulator udid> <output dir>
set -euo pipefail

DEVICE_ID="$1"
OUT_DIR="$2"
BUNDLE_ID="com.bissbilanz.ios.watchkitapp"
SETTLE_SECONDS="${SETTLE_SECONDS:-8}"
MIN_BYTES="${MIN_BYTES:-15000}"
ATTEMPTS=4

# capture <locale> <name> <screen>
capture() {
  local locale="$1" name="$2" screen="$3"
  xcrun simctl terminate "$DEVICE_ID" "$BUNDLE_ID" 2>/dev/null || true
  xcrun simctl launch "$DEVICE_ID" "$BUNDLE_ID" \
    -store_screenshots YES \
    -app_locale "$locale" \
    -AppleLanguages "($locale)" \
    -AppleLocale "${locale}_CH" \
    -store_screenshot_screen "$screen" >/dev/null
  mkdir -p "$OUT_DIR/$locale"
  local file="$OUT_DIR/$locale/$name.png"
  local attempt
  for attempt in $(seq 1 "$ATTEMPTS"); do
    sleep "$SETTLE_SECONDS"
    xcrun simctl io "$DEVICE_ID" screenshot "$file"
    # A blank screen compresses to well under this; a real one never does.
    if [ "$(stat -f%z "$file")" -ge "$MIN_BYTES" ]; then
      local width height
      width=$(sips -g pixelWidth "$file" | awk '/pixelWidth/ {print $2}')
      height=$(sips -g pixelHeight "$file" | awk '/pixelHeight/ {print $2}')
      echo "$locale/$name: ${width}x${height}"
      return 0
    fi
    echo "$locale/$name looks blank (attempt $attempt of $ATTEMPTS), capturing again" >&2
  done
  echo "$locale/$name stayed blank after $ATTEMPTS attempts" >&2
  return 1
}

# The first launch after an install is slow enough to be captured blank, so
# start the app once and throw that launch away.
xcrun simctl launch "$DEVICE_ID" "$BUNDLE_ID" -store_screenshots YES >/dev/null
sleep 20

for locale in en de; do
  capture "$locale" today insights
  capture "$locale" meals meals
  capture "$locale" log log
  capture "$locale" weight weight
  capture "$locale" sleep sleep
done

xcrun simctl terminate "$DEVICE_ID" "$BUNDLE_ID" 2>/dev/null || true
