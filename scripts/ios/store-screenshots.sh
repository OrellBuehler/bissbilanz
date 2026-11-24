#!/usr/bin/env bash
# Captures the App Store screenshots from a booted simulator. The app is
# launched once per screen with -store_screenshots YES, which makes a Debug
# build run on an in-memory store filled with invented demo data (see
# StoreScreenshotSeed.swift). The screen is chosen through launch arguments
# and deep links, so nothing has to be tapped.
#
# Usage: store-screenshots.sh <simulator udid> <output dir>
set -euo pipefail

DEVICE_ID="$1"
OUT_DIR="$2"
BUNDLE_ID="com.bissbilanz.ios"
SETTLE_SECONDS="${SETTLE_SECONDS:-8}"

xcrun simctl status_bar "$DEVICE_ID" override \
  --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100

# capture <locale> <name> <appearance> <tabs> <landing tab> [deep link]
capture() {
  local locale="$1" name="$2" appearance="$3" tabs="$4" landing="$5" link="${6:-}"
  xcrun simctl ui "$DEVICE_ID" appearance "$appearance"
  xcrun simctl terminate "$DEVICE_ID" "$BUNDLE_ID" 2>/dev/null || true
  xcrun simctl launch "$DEVICE_ID" "$BUNDLE_ID" \
    -store_screenshots YES \
    -app_mode local \
    -app_locale "$locale" \
    -AppleLanguages "($locale)" \
    -AppleLocale "${locale}_CH" \
    -tips_enabled NO \
    -selected_tabs "$tabs" \
    -landing_tab "$landing" >/dev/null
  sleep "$SETTLE_SECONDS"
  if [ -n "$link" ]; then
    xcrun simctl openurl "$DEVICE_ID" "$link"
    sleep "$SETTLE_SECONDS"
  fi
  mkdir -p "$OUT_DIR/$locale"
  xcrun simctl io "$DEVICE_ID" screenshot "$OUT_DIR/$locale/$name.png"
}

for locale in en de; do
  capture "$locale" dashboard light "foods,insights,weight" home
  capture "$locale" dashboard-dark dark "foods,insights,weight" home
  capture "$locale" log-food light "foods,insights,weight" home "bissbilanz://log"
  capture "$locale" foods light "foods,insights,weight" foods
  capture "$locale" insights light "foods,insights,weight" insights
  capture "$locale" insights-dark dark "foods,insights,weight" insights
  capture "$locale" weight light "foods,insights,weight" weight
  capture "$locale" recipes light "foods,recipes,insights" recipes
  capture "$locale" recipe light "foods,recipes,insights" recipes "bissbilanz://recipe/demo-recipe-bowl"
  capture "$locale" food light "foods,insights,weight" foods "bissbilanz://food/demo-food-yogurt"
  capture "$locale" calendar light "foods,calendar,insights" calendar
  capture "$locale" sleep light "foods,sleep,insights" sleep
  capture "$locale" favorites light "foods,favorites,insights" favorites
done

xcrun simctl ui "$DEVICE_ID" appearance light
xcrun simctl status_bar "$DEVICE_ID" clear
