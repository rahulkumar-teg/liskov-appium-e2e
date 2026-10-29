#!/usr/bin/env bash
# scripts/build-from-commit.sh — build mobile-liskov at APP_COMMIT.
# Usage: APP_COMMIT=<sha> KIND=android|ios-sim|ios-device [BUILD_VARIANT=economistDebug|economistQaDebug] scripts/build-from-commit.sh
# Prints the artifact path on the last line. Never touches user checkouts, never edits tracked files.
set -euo pipefail
: "${APP_COMMIT:?APP_COMMIT=<sha> required}"
: "${KIND:?KIND=android|ios-sim|ios-device required}"
BUILD_VARIANT="${BUILD_VARIANT:-economistDebug}"
if [ "$KIND" = ios-device ]; then : "${IOS_TEAM_ID:?IOS_TEAM_ID required for ios-device (signing team; no default)}"; fi
ROOT="${LISKOV_BUILD_ROOT:-$HOME/liskov-appium-builds}"
SRC="$ROOT/source"; LOCKS="$ROOT/locks"; TTL="${BUILD_LOCK_TTL_SEC:-5400}"
REMOTE="${LISKOV_REMOTE_URL:-git@github.com:EconomistDigitalSolutions/mobile-liskov.git}"
mkdir -p "$ROOT/cache" "$ROOT/worktrees" "$ROOT/derived" "$LOCKS"

# clean_env <cmd…> (v3.1 A6): run a command under env -i with an explicit allowlist, then fail if any
# UI_TESTING* / MOCK_* variable survived. Prints variable NAMES only, never values. Array expansions are bash 3.2-safe under set -u.
ALLOW=(HOME USER LOGNAME PATH SHELL TMPDIR LANG LC_ALL TERM JAVA_HOME ANDROID_HOME ANDROID_SDK_ROOT GRADLE_USER_HOME DEVELOPER_DIR SSH_AUTH_SOCK)
FORBIDDEN='^(UI_TESTING|MOCK_)'
for v in "${ALLOW[@]}"; do [[ "$v" =~ $FORBIDDEN ]] && { echo "INFRA:BUILD allowlist contains $v" >&2; exit 78; }; done
clean_env() { local extra=() kv=(); [ "${1:-}" = "--with" ] && { IFS=, read -ra extra <<< "$2"; shift 2; }
  for v in "${ALLOW[@]}" ${extra[@]+"${extra[@]}"}; do [ -n "${!v+x}" ] && kv+=("$v=${!v}"); done
  env -i ${kv[@]+"${kv[@]}"} /bin/bash -c 'bad=$(env | cut -d= -f1 | grep -E "^(UI_TESTING|MOCK_)" || true)
    [ -z "$bad" ] || { echo "INFRA:BUILD forbidden build env var(s): $bad" >&2; exit 78; }; exec "$@"' clean_env "$@"; }

# lock <name>: create atomically with {pid,startedAt,ttl}; take over only if the holder is dead or past its TTL.
lock() { local f="$LOCKS/$1.lock"
  until ( set -o noclobber; printf '{"pid":%s,"host":"%s","startedAt":%s,"ttlSec":%s}\n' $$ "$(hostname -s)" "$(date +%s)" "$TTL" > "$f" ) 2>/dev/null; do
    local pid started; pid=$(sed -E 's/.*"pid":([0-9]+).*/\1/' "$f" 2>/dev/null || echo 0); started=$(sed -E 's/.*"startedAt":([0-9]+).*/\1/' "$f" 2>/dev/null || echo 0)
    if ! kill -0 "$pid" 2>/dev/null || [ $(( $(date +%s) - started )) -gt "$TTL" ]; then echo "stale lock $1 (pid $pid) taken over" >&2; rm -f "$f"; continue; fi
    sleep 5                                                     # polling inside a wait-for-lock loop
  done; HELD+=("$f"); }
HELD=()
cleanup() { [ -n "${WT:-}" ] && rm -f "$WT/android/local.properties"; for f in "${HELD[@]:-}"; do [ -n "$f" ] && rm -f "$f"; done; }
trap cleanup EXIT

# 1. Framework-owned clone (blobless) — created once, only ever fetched.
[ -d "$SRC/.git" ] || git clone --filter=blob:none --no-checkout "$REMOTE" "$SRC"
git -C "$SRC" fetch --quiet origin "$APP_COMMIT" 2>/dev/null || git -C "$SRC" fetch --quiet origin
SHA="$(git -C "$SRC" rev-parse --verify "${APP_COMMIT}^{commit}")"
OUT="$ROOT/cache/$SHA"; WT="$ROOT/worktrees/$SHA"; mkdir -p "$OUT"

# 2. Cache hit? (ArtifactResolver also verifies sha256; this is the cheap path for manual use)
case "$KIND" in
  android)    ART="$OUT/android-$BUILD_VARIANT.apk"; [ -f "$ART" ] && { echo "$ART"; exit 0; } ;;
  ios-sim)    ART="$OUT/ios-sim.app";                [ -d "$ART" ] && { echo "$ART"; exit 0; } ;;
  ios-device) ART="$OUT/ios-device.ipa";             [ -f "$ART" ] && { echo "$ART"; exit 0; } ;;
  *) echo "KIND must be android|ios-sim|ios-device" >&2; exit 64 ;;
esac

# 3. Per-checkout lock, then the worktree.
lock "checkout-$SHA"
[ -d "$WT" ] || git -C "$SRC" worktree add --detach "$WT" "$SHA"

case "$KIND" in
android)
  : "${ANDROID_LOCAL_PROPERTIES:?path to local.properties required (never printed)}"
  lock gradle                                                     # one Gradle build at a time on this Mac
  while pgrep -f GradleWrapperMain >/dev/null; do sleep 10; done # wait for a human's Gradle build to finish
  install -m 600 "$ANDROID_LOCAL_PROPERTIES" "$WT/android/local.properties"
  TASK=":app:assemble$(printf '%s' "${BUILD_VARIANT:0:1}" | tr '[:lower:]' '[:upper:]')${BUILD_VARIANT:1}"
  ( cd "$WT/android" && clean_env ./gradlew "$TASK" --no-daemon --build-cache --console=plain )
  BT="$( [ "$BUILD_VARIANT" = economistQaDebug ] && echo qaDebug || echo debug )"
  APK="$(find "$WT/android/app/build/outputs/apk/economist/$BT" -name '*.apk' ! -name '*androidTest*' | head -1)"
  [ -n "$APK" ] || { echo "INFRA:BUILD no APK produced" >&2; exit 2; }
  cp "$APK" "$ART" ;;
ios-sim)
  ( cd "$WT/ios" && clean_env xcodebuild \
      -workspace TheEconomistMobile.xcworkspace -scheme TheEconomistMobile \
      -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$ROOT/derived/$SHA" -clonedSourcePackagesDirPath "$ROOT/spm" -packageAuthorizationProvider netrc \
      CODE_SIGNING_ALLOWED=NO build )
  cp -R "$ROOT/derived/$SHA/Build/Products/Debug-iphonesimulator/TheEconomistMobile.app" "$ART" ;;
ios-device)
  # Match passphrase comes from 1Password via `op run` in the caller's env (MATCH_PASSWORD); never echoed.
  : "${MATCH_PASSWORD:?MATCH_PASSWORD required (op run --env-file .env.op -- …)}"
  ( cd "$WT/ios" && clean_env bundle install --quiet && clean_env --with MATCH_PASSWORD bundle exec fastlane run match \
      type:development readonly:true team_id:"$IOS_TEAM_ID" \
      git_url:git@github.com:EconomistDigitalSolutions/mobile-apple-certificates.git )   # read-only: never creates or renews certs/profiles
  METHOD=$(xcodebuild -help 2>&1 | grep -q '\bdebugging\b' && echo debugging || echo development)
  PLIST="$ROOT/derived/$SHA/ExportOptions.plist"; mkdir -p "$ROOT/derived/$SHA"
  /usr/libexec/PlistBuddy -c "Add :method string $METHOD" -c "Add :teamID string $IOS_TEAM_ID" -c "Add :signingStyle string manual" "$PLIST"
  # provisioningProfiles mapping (bundle id → match profile name) is added from match's sigh_* env output [ASSUMPTION: per extension]
  ( cd "$WT/ios" && clean_env xcodebuild \
      -workspace TheEconomistMobile.xcworkspace -scheme TheEconomistMobile \
      -configuration Debug -sdk iphoneos -destination 'generic/platform=iOS' \
      -derivedDataPath "$ROOT/derived/$SHA" -clonedSourcePackagesDirPath "$ROOT/spm" -packageAuthorizationProvider netrc \
      -archivePath "$ROOT/derived/$SHA/App.xcarchive" archive )      # project's Manual signing used as-is
  clean_env xcodebuild -exportArchive -archivePath "$ROOT/derived/$SHA/App.xcarchive" \
      -exportOptionsPlist "$PLIST" -exportPath "$ROOT/derived/$SHA/export"
  cp "$(find "$ROOT/derived/$SHA/export" -name '*.ipa' | head -1)" "$ART" ;;
esac

# 4. Metadata (ArtifactResolver adds sha256), then drop the worktree (artifacts stay cached).
printf '{"sha":"%s","kind":"%s","variant":"%s","builtAt":"%s"}\n' \
  "$SHA" "$KIND" "$BUILD_VARIANT" "$(date -u +%FT%TZ)" > "$OUT/$KIND.json"
git -C "$SRC" worktree remove --force "$WT"
echo "$ART"
