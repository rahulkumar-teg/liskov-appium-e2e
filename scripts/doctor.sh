#!/usr/bin/env bash
# scripts/doctor.sh — version pins (plan §3). Read-only: installs nothing, starts nothing, touches no device.
# Node/npm/package pins are enforced; Appium drivers (xcuitest 12.22.2, uiautomator2 8.7.0 in the framework-local
# APPIUM_HOME), Xcode, Android SDK and `op` are reported.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0; warn=0
ok()   { printf '[ OK  ] %s\n' "$*"; }
bad()  { printf '[ERROR] %s\n' "$*"; fail=$((fail+1)); }
note() { printf '[WARN ] %s\n' "$*"; warn=$((warn+1)); }

# --- pinned set (update in the same change as a bump; majors need the one-week smoke bake) ---
NODE_MAJORS="22 24 26"            # 22 LTS preferred (.nvmrc); 24/26 accepted
PINNED_XCUITEST="12.22.2"         # 2026-10-28: Appium 3 peer, WDA>=14 (Xcode 27), iOS 26.4+ fully supported; bake pending
PINNED_UIAUTOMATOR2="8.7.0"       # 2026-10-29: OnePlus + Pixel_10_Pro (API 37) runs
PINNED_XCODE="27.1"

node_v=$(node --version 2>/dev/null || true)
if [ -z "$node_v" ]; then bad "node not found"; else
  major=${node_v#v}; major=${major%%.*}
  case " $NODE_MAJORS " in *" $major "*) ok "node $node_v";; *) bad "node $node_v not in {$NODE_MAJORS} (use: nvm use 22)";; esac
  [ "$major" = "22" ] || note "node $node_v: plan prefers 22 LTS (.nvmrc)"
fi
npm_v=$(npm --version 2>/dev/null || true); [ -n "$npm_v" ] && ok "npm $npm_v" || bad "npm not found"

# package.json pins == installed node_modules
if [ -d node_modules ]; then
  node -e '
    const p=require("./package.json"); let bad=0;
    for (const [n,v] of Object.entries({...p.dependencies,...p.devDependencies})) {
      let got; try { got=require("./node_modules/"+n+"/package.json").version } catch { got="(missing)" }
      if (got!==v) { console.log("[ERROR] "+n+" pinned "+v+" installed "+got); bad++ }
    }
    if(!bad) console.log("[ OK  ] all "+Object.keys({...p.dependencies,...p.devDependencies}).length+" package.json pins match node_modules");
    process.exit(bad?1:0)' || fail=$((fail+1))
else bad "node_modules missing (npm ci)"; fi

appium_v=$(npx --no-install appium --version 2>/dev/null | tail -1 || true)
[ -n "$appium_v" ] && ok "appium $appium_v (local devDependency)" || bad "appium not runnable"
export APPIUM_HOME="${APPIUM_HOME:-$HOME/.liskov-appium/appium-home}"   # framework-local, never ~/.appium
drivers=$(npx --no-install appium driver list --installed --json 2>/dev/null || echo '{}')
for d in xcuitest uiautomator2; do
  v=$(printf '%s' "$drivers" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j[process.argv[1]]?.version??"")}catch{}})' "$d")
  pin=""; [ "$d" = xcuitest ] && pin="$PINNED_XCUITEST"; [ "$d" = uiautomator2 ] && pin="$PINNED_UIAUTOMATOR2"
  if [ -z "$v" ]; then note "appium driver $d not installed in $APPIUM_HOME${pin:+ (pinned $pin)}"
  elif [ -n "$pin" ] && [ "$v" != "$pin" ]; then bad "appium driver $d $v != pinned $pin"
  else ok "appium driver $d $v${pin:+ (pinned)}"; fi
done
[ -z "$PINNED_UIAUTOMATOR2" ] && note "uiautomator2 pin not set yet (TBD after smoke bake, plan §3)"

if command -v xcodebuild >/dev/null 2>&1; then
  xv=$(xcodebuild -version 2>/dev/null | head -1 || true)     # version query only, never a build
  case "$xv" in "Xcode $PINNED_XCODE"*) ok "$xv";; "") note "xcodebuild present but no version (CLT only?)";; *) note "$xv (pinned $PINNED_XCODE)";; esac
else note "xcodebuild not found (iOS targets unavailable on this host)"; fi

# Presence only: adb is never invoked by doctor (it could start the adb server).
command -v adb >/dev/null 2>&1 && ok "adb present at $(command -v adb) (not invoked)" || note "adb not on PATH (Android targets unavailable)"
[ -n "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ] && ok "ANDROID_HOME=${ANDROID_HOME:-$ANDROID_SDK_ROOT}" || note "ANDROID_HOME / ANDROID_SDK_ROOT unset"
command -v op >/dev/null 2>&1 && ok "1Password CLI $(op --version 2>/dev/null)" || note "1Password CLI (op) not installed — secrets cannot resolve (§4.25)"
command -v java >/dev/null 2>&1 && ok "java present (allure-commandline needs it)" || note "java not found — \`make report\` (allure) will not work"

echo "doctor: $fail error(s), $warn warning(s)"
[ "$fail" -eq 0 ]
