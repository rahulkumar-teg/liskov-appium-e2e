#!/bin/bash
# One spec on one pinned device: scripts/run/run-one.sh <android-real|android-emu|ios-real> <ep01|login|…> [attempt]
# Device: ANDROID_SERIAL (android-*) or IOS_UDID (ios-real) from the environment — nothing is hard-coded here.
# Per-target defaults (override via env): APPIUM_PORT 4725 | 4727 | 4726; SUITE_DIR=reports/suite-<target>,
# ALLURE_DIR=allure-results-<target>, EVIDENCE_DIR=reports/evidence-<target>; SPEC_TIMEOUT=1200 s.
# Exit: 0 = PASS/SKIP, 1 = FAIL, 2 = bad args/config, 3 = device locked or wrong AVD (spec not started).
# Never installs, clears or uninstalls anything; starts only our own Appium (scripts/appium-dev.sh) when needed.
set -u
cd "$(dirname "$0")/../.."
t="${1:-}"; n="${2:-}"; a="${3:-1}"
[ -n "$t" ] && [ -n "$n" ] || { echo "usage: $0 <android-real|android-emu|ios-real> <ep01|login|restore-own> [attempt]"; exit 2; }
ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
adbq() { perl -e 'alarm 30; exec @ARGV' "$ADB" -s "$ANDROID_SERIAL" "$@"; }
case "$t" in
  android-real|android-emu)
    : "${ANDROID_SERIAL:?ANDROID_SERIAL required}"; unset IOS_UDID
    conf="wdio.$t.conf.ts"; specvar=ANDROID_SPECS; export UIA2_SYSTEM_PORT="${UIA2_SYSTEM_PORT:-8213}"
    if [ "$t" = android-emu ]; then
      export APPIUM_PORT="${APPIUM_PORT:-4727}"
      avd=$(adbq emu avd name | head -1 | tr -d '\r')
      [ "$avd" = Pixel_10_Pro ] || { echo "WRONG AVD: $ANDROID_SERIAL is '$avd', not Pixel_10_Pro; not starting $n"; exit 3; }
    else
      export APPIUM_PORT="${APPIUM_PORT:-4725}"
    fi
    if adbq shell dumpsys window | grep -q 'isKeyguardShowing=true'; then echo "LOCKED: keyguard showing, not starting $n"; exit 3; fi ;;
  ios-real)
    : "${IOS_UDID:?IOS_UDID required}"; unset ANDROID_SERIAL UIA2_SYSTEM_PORT
    conf=wdio.ios-real.conf.ts; specvar=IOS_SPECS; export APPIUM_PORT="${APPIUM_PORT:-4726}"
    if xcrun devicectl device info lockState --device "$IOS_UDID" 2>/dev/null | grep -q 'passcodeRequired: true'; then echo "LOCKED: device needs passcode, not starting $n"; exit 3; fi ;;
  *) echo "unknown target $t"; exit 2 ;;
esac
f=$(ls specs/epaper/"$n"-*.spec.ts specs/maintenance/"$n".spec.ts 2>/dev/null | head -1)
[ -n "$f" ] || { echo "no spec for $n"; exit 2; }
export SUITE_DIR="${SUITE_DIR:-reports/suite-$t}" ALLURE_DIR="${ALLURE_DIR:-allure-results-$t}" EVIDENCE_DIR="${EVIDENCE_DIR:-reports/evidence-$t}"
bash scripts/appium-dev.sh status >/dev/null || bash scripts/appium-dev.sh start || exit 2
mkdir -p "$SUITE_DIR"; L="$SUITE_DIR/$n.a$a.log"
echo "$(date '+%F %T %Z') START $n attempt $a ($t, appium $APPIUM_PORT)"
env "$specvar=./$f" perl -e 'alarm shift; exec @ARGV' "${SPEC_TIMEOUT:-1200}" npx --no-install wdio run "$conf" > "$L" 2>&1
rc=$?
echo "$(date '+%F %T %Z') END $n attempt $a exit $rc"
r=PASS; grep -q 'SKIP:' "$L" && r="SKIP $(grep -o 'SKIP:[A-Z_]*' "$L" | head -1)"; [ $rc -ne 0 ] && r=FAIL
echo "RESULT $n a$a $r log=$L"
grep -h 'popup dismissed\|popup UNKNOWN\|popup retry\|refused' "$L" | sed 's/^\[0-0\] //' | sort | uniq -c | sed 's/^/  /'
[ "$r" = FAIL ] && exit 1 || exit 0
