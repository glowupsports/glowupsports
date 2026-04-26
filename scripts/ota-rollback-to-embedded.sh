#!/usr/bin/env bash
# =============================================================================
# OTA Rollback-to-Embedded — scripts/ota-rollback-to-embedded.sh (Task #1374)
# =============================================================================
# Publishes an `isRollBackToEmbedded:true` marker for a single
# (platform, runtime) pair on the production channel. Devices on the
# matching binary pick it up on next cold start and fall back to the JS
# embedded in the App Store / Play Store binary instead of any broken
# OTA bundle currently sitting on that runtime.
#
# Use case (the one this was written for): on 2026-04-26 the #1372
# fan-out shipped a bundle built against 1.3.6 to iOS 1.3.4 / 1.3.5
# binaries and made the player home unusable there. Run this script
# once per affected runtime to roll those installs back to embedded JS:
#
#   bash scripts/ota-rollback-to-embedded.sh ios 1.3.4 \
#     "Task #1374 — roll iOS 1.3.4 back to embedded"
#   bash scripts/ota-rollback-to-embedded.sh ios 1.3.5 \
#     "Task #1374 — roll iOS 1.3.5 back to embedded"
#
# Why a separate script: scripts/ota-rollback.sh hardcodes the EAS
# `group` IDs from the Task #1289 incident. We don't have a pre-built
# rollback marker for #1374, and `eas update --roll-back-to-embedded`
# doesn't need one — it publishes a fresh "use embedded" marker for
# whatever runtime app.json currently declares.
#
# This script mutates app.json's runtimeVersion temporarily (same
# pattern as ota-push.sh) so a single working tree can publish to a
# runtime other than the one it's currently configured for. The
# original app.json is restored on exit.
#
# IMPORTANT for agents: this calls `eas update`, which can exceed the
# 2-minute bash timeout. Run from a real shell (the Replit "OTA Push"
# workflow's shell is suitable), not from an agent bash command.
# =============================================================================

set -euo pipefail

PLATFORM="${1:-}"
TARGET_RT="${2:-}"
MESSAGE="${3:-Rollback to embedded ($PLATFORM $TARGET_RT)}"

if [[ -z "$PLATFORM" || -z "$TARGET_RT" ]]; then
  cat >&2 <<EOF
Usage: bash scripts/ota-rollback-to-embedded.sh <platform> <runtime> [message]

  platform  ios | android
  runtime   the runtimeVersion of the binary you want to roll back
            (must equal what those installs report — check
             scripts/live-runtimes.json or the device debug line)
  message   optional EAS message; defaults to a generic rollback note

Example:
  bash scripts/ota-rollback-to-embedded.sh ios 1.3.4 \\
    "Task #1374 — roll iOS 1.3.4 back to embedded"
EOF
  exit 1
fi

if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" ]]; then
  echo "ERROR: platform must be 'ios' or 'android' (got: $PLATFORM)" >&2
  exit 1
fi

echo "################################################################"
echo "#  OTA Rollback-to-Embedded"
echo "#  Platform : $PLATFORM"
echo "#  Runtime  : $TARGET_RT"
echo "#  Message  : $MESSAGE"
echo "#  Time     : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "################################################################"
echo ""

export CI=true
export EAS_NO_VCS=1

APP_JSON_BACKUP="$(mktemp -t app.json.backup.XXXXXX)"
cp app.json "$APP_JSON_BACKUP"

restore_app_json() {
  if [[ -f "$APP_JSON_BACKUP" ]]; then
    cp "$APP_JSON_BACKUP" app.json
    rm -f "$APP_JSON_BACKUP"
    echo "  ✔ restored original app.json"
  fi
}
trap restore_app_json EXIT

# Mutate app.json's $platform.runtimeVersion to the runtime we want to
# roll back. eas update reads this at publish time.
node -e "
const fs = require('fs');
const path = './app.json';
const cfg = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!cfg.expo) throw new Error('app.json has no expo block');
if (!cfg.expo['$PLATFORM']) cfg.expo['$PLATFORM'] = {};
cfg.expo['$PLATFORM'].runtimeVersion = '$TARGET_RT';
fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
"
echo "  ✔ temporarily set app.json $PLATFORM.runtimeVersion → $TARGET_RT"
echo ""

JSON_FILE="/tmp/ota-rollback-embedded-${PLATFORM}-${TARGET_RT}.json"
LOG_FILE="/tmp/ota-rollback-embedded-${PLATFORM}-${TARGET_RT}.log"

set +e
npx --yes eas-cli@latest update \
  --channel production \
  --environment production \
  --message "$MESSAGE" \
  --platform "$PLATFORM" \
  --roll-back-to-embedded \
  --non-interactive \
  --json \
  > "$JSON_FILE" \
  2> >(tee "$LOG_FILE" >&2)
RC=$?
set -e

if [[ $RC -ne 0 ]]; then
  echo ""
  echo "ERROR: eas update --roll-back-to-embedded failed (exit $RC). See $LOG_FILE" >&2
  exit $RC
fi

echo ""
echo "--- eas update JSON ---"
cat "$JSON_FILE"
echo ""

# Quick sanity check that what we just published is in fact a
# roll-back-to-embedded marker on the requested runtime.
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$JSON_FILE', 'utf8'));
const items = Array.isArray(data) ? data : [data];
const entry = items.find(u => u && u.platform === '$PLATFORM');
if (!entry) {
  console.error('  ✘ no entry for platform $PLATFORM in eas response');
  process.exit(1);
}
if (entry.runtimeVersion !== '$TARGET_RT') {
  console.error('  ✘ runtime mismatch: got ' + entry.runtimeVersion + ', expected $TARGET_RT');
  process.exit(1);
}
if (entry.isRollBackToEmbedded !== true) {
  console.error('  ✘ entry is not a roll-back-to-embedded marker');
  process.exit(1);
}
console.log('  ✔ rollback marker published: id=' + entry.id +
            ' runtime=' + entry.runtimeVersion +
            ' group=' + entry.group);
"

echo ""
echo "################################################################"
echo "#  Rollback-to-embedded marker published for $PLATFORM $TARGET_RT."
echo "#  Devices on this runtime will fall back to the JS embedded in"
echo "#  the App Store / Play Store binary on their next cold start."
echo "#  Force-quit + relaunch on a tester device to verify."
echo "################################################################"
