#!/usr/bin/env bash
# =============================================================================
# OTA Rollback Script — scripts/ota-rollback.sh  (Task #1289)
# =============================================================================
# Re-publishes the known-good rollback markers that were created earlier today
# but immediately overwritten by an accidental OTA Push re-fire. After this
# script succeeds, end users on the affected runtimes pick up the rollback
# signal on their next cold start and load the embedded App Store bundle
# instead of the broken OTA.
#
# Rollback markers (verified in /tmp/ota-push-*.json from the original push):
#   iOS 1.3.4     → group 1f193ea5-66ef-4f34-8504-8c6e9bd7ed9c
#   Android 1.3.5 → group 01392adb-64f7-4219-85fc-001fda264377
#
# Usage:
#   bash scripts/ota-rollback.sh
#
# This script intentionally does NOT honour the OTA Push kill switch — it
# is the inverse operation and the only way to re-stop the bleeding.
# =============================================================================

set -euo pipefail

# Both the original (1f193ea5… / 01392adb…) and the re-published (102f8fb8…
# / bb2b624f…) markers are valid `isRollBackToEmbedded:true` updates — the
# canonical "current" rollback markers are the re-published ones, since
# they're already at the top of the production branch as of 24 Apr 2026.
# We point the script at the canonical ones so an operator running this in
# a fresh incident republishes the most-recent known-good rollback.
IOS_GROUP="${OTA_ROLLBACK_IOS_GROUP:-102f8fb8-c74b-457c-937d-bb56e37f54e2}"
ANDROID_GROUP="${OTA_ROLLBACK_ANDROID_GROUP:-bb2b624f-e2d7-4e54-8121-b77953063534}"
MESSAGE="${OTA_ROLLBACK_MESSAGE:-Rollback re-publish (Task #1289)}"

echo "################################################################"
echo "#  OTA Rollback re-publish"
echo "#  iOS group     : $IOS_GROUP"
echo "#  Android group : $ANDROID_GROUP"
echo "#  Message       : $MESSAGE"
echo "#  Time          : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "################################################################"
echo ""

export CI=true
export EAS_NO_VCS=1

republish_group() {
  local label="$1"
  local group="$2"
  local logfile="/tmp/ota-rollback-$label.log"
  local jsonfile="/tmp/ota-rollback-$label.json"

  echo ""
  echo "============================================================"
  echo "  Re-publishing $label rollback (group $group)"
  echo "============================================================"

  # Use --yes eas-cli@latest so the script works the same in nohup as it
  # does in foreground. Without --yes, npx may stall on an "install latest?"
  # prompt that has no tty in a backgrounded process.
  set +e
  npx --yes eas-cli@latest update:republish \
    --group "$group" \
    --message "$MESSAGE" \
    --non-interactive \
    --json \
    > "$jsonfile" \
    2> "$logfile"
  local rc=$?
  set -e
  cat "$logfile" >&2

  if [[ $rc -ne 0 ]]; then
    echo ""
    echo "ERROR: republish failed for $label (exit $rc). See $logfile" >&2
    return $rc
  fi

  echo ""
  echo "--- republish JSON ($label) ---"
  cat "$jsonfile"
  echo ""
  echo ">>> $label rollback re-published <<<"
}

republish_group "ios" "$IOS_GROUP"
republish_group "android" "$ANDROID_GROUP"

echo ""
echo "================================================================"
echo "  Verifying with eas update:list (branch=production, limit=4)"
echo "================================================================"
npx eas update:list --branch production --json --non-interactive --limit 4 \
  > /tmp/ota-rollback-list.json 2>/tmp/ota-rollback-list.err || {
    echo "  ✘ eas update:list failed. Stderr:" >&2
    cat /tmp/ota-rollback-list.err >&2 || true
    exit 3
  }

node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/tmp/ota-rollback-list.json','utf8'));
const items = (data.currentPage || data) || [];
items.slice(0,6).forEach(u => {
  console.log(' ', u.platforms || u.platform, 'rt', u.runtimeVersion,
    'group', (u.group||'').slice(0,8),
    '—', (u.message||'').slice(0,80));
});
"

echo ""
echo "################################################################"
echo "#  OTA Rollback re-publish complete."
echo "#"
echo "#  Confirm above that the most recent two updates are the"
echo "#  rollback messages, NOT the broken bundle. End users on"
echo "#  iOS 1.3.4 / Android 1.3.5 will pick up the rollback on"
echo "#  their next cold start."
echo "################################################################"
