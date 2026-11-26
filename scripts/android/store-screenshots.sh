#!/usr/bin/env bash
# Captures the Play Store phone screenshots from a booted emulator. The Debug app is
# launched once per screen with `--es store_screenshot <screen>`, which makes it run in
# Local mode on invented demo data (see StoreScreenshotSeed.kt) and open that screen, so
# nothing has to be tapped. A capture is only taken once the screen shows text that proves
# it is rendered (and no progress indicator); a blank or half-loaded capture is retried.
#
# Usage: store-screenshots.sh <output dir>
# Needs: adb with exactly one emulator running and the Debug APK installed.
set -euo pipefail

OUT_DIR="$1"
PKG="com.bissbilanz.android"
ACTIVITY="$PKG/.MainActivity"
TAG="StoreScreenshots"
WIDTH=1080
HEIGHT=1920
DENSITY=420
SETTLE_SECONDS="${SETTLE_SECONDS:-2}"
READY_TIMEOUT="${READY_TIMEOUT:-45}"
ATTEMPTS="${ATTEMPTS:-3}"
# A blank or half-loaded 1080x1920 screen compresses to far less than any real one.
MIN_PNG_BYTES=40000

WORK_DIR="$(mktemp -d)"

log() { echo "[store-screenshots] $*" >&2; }

adb_sh() { adb shell "$@" | tr -d '\r'; }

wait_for_boot() {
  adb wait-for-device
  until [ "$(adb_sh getprop sys.boot_completed)" = "1" ]; do sleep 2; done
}

prepare_device() {
  wait_for_boot
  adb shell input keyevent 82 || true
  adb shell wm dismiss-keyguard || true
  adb shell wm size "${WIDTH}x${HEIGHT}"
  adb shell wm density "$DENSITY"
  # Gesture navigation, like current phones, instead of the three buttons.
  adb shell cmd overlay enable com.android.internal.systemui.navbar.gestural || true
  adb shell settings put global window_animation_scale 0
  adb shell settings put global transition_animation_scale 0
  adb shell settings put global animator_duration_scale 0
  adb shell settings put secure show_ime_with_hard_keyboard 0
  # Offline, so the food search only lists the demo foods and never real Open Food Facts products.
  adb shell svc wifi disable || true
  adb shell svc data disable || true
  adb shell cmd uimode night no
  # Fixed clock, full battery, wifi only, no notification icons.
  adb shell settings put global sysui_demo_allowed 1
  demo_cmd enter
  demo_cmd clock -e hhmm 0941
  demo_cmd battery -e level 100 -e plugged false
  demo_cmd network -e wifi show -e level 4 -e fully true
  demo_cmd network -e mobile hide
  demo_cmd notifications -e visible false
  demo_cmd status -e volume hide -e bluetooth hide
  sleep 2
}

demo_cmd() {
  local command="$1"
  shift
  adb shell am broadcast -a com.android.systemui.demo -e command "$command" "$@" >/dev/null
}

restore_device() {
  demo_cmd exit || true
  adb shell svc wifi enable || true
  adb shell cmd uimode night no || true
  adb shell wm size reset || true
  adb shell wm density reset || true
}
trap 'restore_device; rm -rf "$WORK_DIR"' EXIT

# The app's own language setting, read when the activity is created. Written with the
# app's identity (the Debug build is debuggable), because nothing in the app can set it
# before its first frame.
set_language() {
  local tag="$1"
  cat >"$WORK_DIR/app_language.xml" <<EOF
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="language_tag">$tag</string>
</map>
EOF
  adb push "$WORK_DIR/app_language.xml" /data/local/tmp/app_language.xml >/dev/null
  adb shell run-as "$PKG" mkdir -p shared_prefs
  adb shell run-as "$PKG" cp /data/local/tmp/app_language.xml shared_prefs/app_language.xml
}

# Wipes the app, so the next launch seeds the demo data again in the new language.
reset_app() {
  adb shell am force-stop "$PKG"
  adb shell pm clear "$PKG" >/dev/null
  set_language "$1"
}

# launch <screen> [insights tab]; returns once the app has logged that the screen is requested.
launch() {
  local screen="$1" insights_tab="${2:-}" timeout="${3:-$READY_TIMEOUT}"
  local args=(--es store_screenshot "$screen")
  if [ -n "$insights_tab" ]; then
    args+=(--es store_screenshot_insights_tab "$insights_tab")
  fi
  if [ -n "${LAUNCH_QUERY:-}" ]; then
    args+=(--es store_screenshot_query "$LAUNCH_QUERY")
  fi
  adb logcat -c
  adb shell am force-stop "$PKG"
  adb shell am start -W -n "$ACTIVITY" "${args[@]}" >/dev/null
  local waited=0 logs
  while true; do
    logs="$(adb logcat -d -s "$TAG:I")"
    if grep -q "ready $screen" <<<"$logs"; then
      return 0
    fi
    if grep -q "failed $screen" <<<"$logs"; then
      echo "$logs" >&2
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
    if [ "$waited" -ge "$timeout" ]; then
      log "timed out waiting for $screen to be ready"
      return 1
    fi
  done
}

# The accessibility tree of the screen, or nothing when the UI never goes idle.
dump_ui() {
  adb shell uiautomator dump /sdcard/store-screenshot-ui.xml >"$WORK_DIR/dump.log" 2>&1 || return 1
  adb exec-out cat /sdcard/store-screenshot-ui.xml
}

# wait_for_text <timeout> <text>...; true once one of the texts is on screen and no
# progress indicator is.
wait_for_text() {
  local timeout="$1"
  shift
  local waited=0 ui text
  while [ "$waited" -lt "$timeout" ]; do
    if ui="$(dump_ui)"; then
      if ! grep -q 'class="android.widget.ProgressBar"' <<<"$ui"; then
        for text in "$@"; do
          if grep -qF "$text" <<<"$ui"; then
            return 0
          fi
        done
      fi
    fi
    sleep 1
    waited=$((waited + 1))
  done
  return 1
}

# True when a system dialog (crash, ANR, permission) is in front of the app.
system_dialog_showing() {
  local ui
  ui="$(dump_ui)" || return 1
  grep -qE 'package="(com.android.systemui|android)"[^>]*text="[^"]*(isn.t responding|keeps stopping|Allow)' <<<"$ui" ||
    grep -qE 'resource-id="android:id/(alertTitle|aerr_close|button1)"' <<<"$ui"
}

# Keeps what the screen looked like when an attempt failed, next to the screenshots.
save_debug() {
  local locale="$1" name="$2" attempt="$3"
  local dir="$OUT_DIR/failed"
  mkdir -p "$dir"
  adb exec-out screencap -p >"$dir/$locale-$name-$attempt.png" || true
  dump_ui >"$dir/$locale-$name-$attempt.xml" || true
  cp "$WORK_DIR/dump.log" "$dir/$locale-$name-$attempt.dump.log" || true
}

png_size() {
  local file="$1"
  local w h
  read -r w h < <(od -An -tu1 -j16 -N8 "$file" | awk '{print $1*16777216+$2*65536+$3*256+$4, $5*16777216+$6*65536+$7*256+$8}')
  echo "${w}x${h}"
}

# shoot <locale> <name> <screen> <insights tab or ""> <ready texts, | separated> [after script]
# Launches the screen, waits until it is rendered, optionally runs a step (typing, scrolling)
# and waits for its result, then takes the capture and checks it.
shoot() {
  local locale="$1" name="$2" screen="$3" insights_tab="$4" ready="$5" after="${6:-}" after_ready="${7:-}"
  if [ -n "${ONLY:-}" ] && [[ " $ONLY " != *" $name "* ]]; then
    return 0
  fi
  local file="$OUT_DIR/$locale/$name.png"
  local attempt texts
  mkdir -p "$OUT_DIR/$locale"
  for attempt in $(seq 1 "$ATTEMPTS"); do
    log "$locale/$name (attempt $attempt)"
    if ! launch "$screen" "$insights_tab"; then
      continue
    fi
    IFS='|' read -r -a texts <<<"$ready"
    if ! wait_for_text 30 "${texts[@]}"; then
      log "$locale/$name: screen never showed '$ready'"
      save_debug "$locale" "$name" "$attempt"
      continue
    fi
    if [ -n "$after" ]; then
      sleep "$SETTLE_SECONDS"
      $after
      IFS='|' read -r -a texts <<<"$after_ready"
      if ! wait_for_text 20 "${texts[@]}"; then
        log "$locale/$name: step never showed '$after_ready'"
        save_debug "$locale" "$name" "$attempt"
        continue
      fi
    fi
    sleep "$SETTLE_SECONDS"
    if system_dialog_showing; then
      log "$locale/$name: a system dialog is showing"
      continue
    fi
    adb exec-out screencap -p >"$file"
    local bytes
    bytes="$(stat -c%s "$file")"
    if [ "$bytes" -lt "$MIN_PNG_BYTES" ]; then
      log "$locale/$name looks blank ($bytes bytes), capturing again"
      continue
    fi
    # Still rendered after the capture: nothing finished loading in the meantime.
    if ! wait_for_text 5 "${texts[@]}"; then
      log "$locale/$name changed while it was captured"
      continue
    fi
    log "$locale/$name ok ($bytes bytes, $(png_size "$file"))"
    return 0
  done
  log "$locale/$name FAILED after $ATTEMPTS attempts"
  return 1
}

# Scrolls the food detail down to its nutrient cards.
scroll_to_nutrients() {
  adb shell input swipe 100 1750 100 300 1800
}

prepare_device
failed=0

for locale in en de; do
  if [ "$locale" = "en" ]; then
    breakfast="Breakfast"
    log_food_result="Basmati rice"
    foods_ready="Almonds"
    insights_ready="Overview"
    weight_ready="Weight Log"
    nutrients_ready="Salmon fillet"
    vitamins="Vitamins"
    recipe_ready="Start cooking"
    SEARCH_QUERY="rice"
  else
    breakfast="Frühstück"
    log_food_result="Basmatireis"
    foods_ready="Apfel"
    insights_ready="Übersicht"
    weight_ready="Gewichtsverlauf"
    nutrients_ready="Lachsfilet"
    vitamins="Vitamine"
    recipe_ready="Kochen starten"
    SEARCH_QUERY="reis"
  fi

  reset_app "$locale"
  adb shell cmd uimode night no
  # The first launch after the wipe seeds the demo data, which takes a while.
  launch home "" 240 || failed=1
  wait_for_text 60 "$breakfast" || failed=1

  shoot "$locale" dashboard home "" "$breakfast" || failed=1
  LAUNCH_QUERY="$SEARCH_QUERY"
  shoot "$locale" log-food log-food "" "$log_food_result" || failed=1
  LAUNCH_QUERY=""
  shoot "$locale" foods foods "" "$foods_ready" || failed=1
  shoot "$locale" weight weight "" "$weight_ready" || failed=1
  shoot "$locale" recipe recipe "" "$recipe_ready" || failed=1
  shoot "$locale" nutrients nutrients "" "$nutrients_ready" scroll_to_nutrients "$vitamins" || failed=1

  adb shell cmd uimode night yes
  shoot "$locale" dashboard-dark home "" "$breakfast" || failed=1
  shoot "$locale" insights-dark insights overview "$insights_ready" || failed=1
done

exit "$failed"
