#!/usr/bin/env bash
# =============================================================================
# OTA Push Script — scripts/ota-push.sh
# =============================================================================
# AGENT INSTRUCTIONS:
#   Do NOT run `eas update` directly in a bash command — it will time out at
#   the 2-minute hard limit while the upload is still in progress.
#
#   Instead, use the "OTA Push" Replit workflow and monitor its log output:
#     1. Start the workflow named "OTA Push" via the workflows skill,
#        passing OTA_MESSAGE (and optionally OTA_PLATFORM) as environment
#        variables so the script knows what to publish.
#     2. Wait for the workflow to finish (state: "finished" or "failed").
#     3. Read the workflow logs to confirm success or diagnose errors.
#
#   The workflow runs this script as a long-running process that is not subject
#   to the 2-minute bash tool timeout. iOS and Android are pushed sequentially
#   to keep memory usage low.
#
# USAGE — direct invocation:
#   bash scripts/ota-push.sh "Your update message here"
#   bash scripts/ota-push.sh "Your update message here" --platform ios
#   bash scripts/ota-push.sh "Your update message here" --platform android
#   OTA_MESSAGE="Fix bug" OTA_PLATFORM=ios bash scripts/ota-push.sh
#
# USAGE — via "OTA Push" workflow (preferred, avoids bash timeout):
#   Set OTA_MESSAGE env var, then trigger the "OTA Push" workflow.
#   Optionally set OTA_PLATFORM to "ios" or "android" (default: both).
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Parse arguments — OTA_MESSAGE / OTA_PLATFORM env vars are fallbacks
# ---------------------------------------------------------------------------
MESSAGE="${OTA_MESSAGE:-}"
PLATFORM="${OTA_PLATFORM:-all}"  # "ios", "android", or "all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message)
      MESSAGE="$2"
      shift 2
      ;;
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --*)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
    *)
      if [[ -z "$MESSAGE" ]]; then
        MESSAGE="$1"
      fi
      shift
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Guard: no message → print usage and exit cleanly (not a crash)
# This allows the workflow to be listed without side effects when no push is
# intended (e.g. when the Run button composite triggers it inadvertently).
# ---------------------------------------------------------------------------
if [[ -z "$MESSAGE" ]]; then
  echo "OTA Push — no message provided, skipping."
  echo ""
  echo "To push an OTA update, supply a message:"
  echo "  bash scripts/ota-push.sh \"Fix bug XYZ\""
  echo "  bash scripts/ota-push.sh \"Fix bug XYZ\" --platform ios"
  echo "  OTA_MESSAGE=\"Fix bug XYZ\" <trigger OTA Push workflow>"
  echo ""
  echo "No changes were made."
  exit 0
fi

if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" && "$PLATFORM" != "all" ]]; then
  echo "ERROR: --platform (or OTA_PLATFORM) must be 'ios', 'android', or 'all' (default)." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Environment — memory-optimised, non-interactive CI mode
# ---------------------------------------------------------------------------
export CI=true
export NODE_OPTIONS="--max-old-space-size=4096"
export EAS_NO_VCS=1

# ---------------------------------------------------------------------------
# Helper: run eas update for a single platform
# ---------------------------------------------------------------------------
push_platform() {
  local platform="$1"
  echo ""
  echo "============================================================"
  echo "  OTA Push — platform: $platform"
  echo "  Message : $MESSAGE"
  echo "  Channel : production"
  echo "  Time    : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "============================================================"

  npx eas update \
    --channel production \
    --message "$MESSAGE" \
    --platform "$platform" \
    --non-interactive \
    --json \
    2>&1 | tee /tmp/ota-push-"$platform".log

  echo ""
  echo ">>> $platform OTA push complete <<<"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
echo ""
echo "################################################################"
echo "#  OTA Push Starting"
echo "#  Platform : $PLATFORM"
echo "#  Message  : $MESSAGE"
echo "################################################################"
echo ""

if [[ "$PLATFORM" == "ios" ]]; then
  push_platform "ios"
elif [[ "$PLATFORM" == "android" ]]; then
  push_platform "android"
else
  # Default: iOS first, then Android — sequential to keep memory low
  push_platform "ios"
  push_platform "android"
fi

echo ""
echo "################################################################"
echo "#  OTA Push Finished Successfully"
echo "################################################################"
echo ""
