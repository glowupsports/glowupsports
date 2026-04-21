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
#
# Precedence (highest → lowest):
#   1. --message flag or positional CLI argument
#   2. `.local/.commit_message` file (written by the agent for the current task)
#   3. OTA_MESSAGE environment variable (e.g. hardcoded in .replit workflow)
#
# Rationale: the .replit workflow's OTA_MESSAGE is hardcoded and the agent
# cannot edit it, so each task ended up shipping with the *previous* task's
# release notes. Reading `.local/.commit_message` (which the agent always
# writes before completing a task) ensures the EAS dashboard shows the
# correct task summary for every push, with no manual .replit edits needed.
# ---------------------------------------------------------------------------
CLI_MESSAGE=""
PLATFORM="${OTA_PLATFORM:-all}"  # "ios", "android", or "all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message)
      CLI_MESSAGE="$2"
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
      if [[ -z "$CLI_MESSAGE" ]]; then
        CLI_MESSAGE="$1"
      fi
      shift
      ;;
  esac
done

MESSAGE=""
MESSAGE_SOURCE=""

if [[ -n "$CLI_MESSAGE" ]]; then
  MESSAGE="$CLI_MESSAGE"
  MESSAGE_SOURCE="CLI argument"
elif [[ -f ".local/.commit_message" ]]; then
  # Use the first non-empty line of the agent's commit message for this task.
  # EAS update messages are capped at 1024 chars; trim defensively.
  #
  # Guard against `set -euo pipefail` aborts: if the file is empty or has
  # only blank lines, grep exits non-zero and SIGPIPE from `head -c` can
  # also bubble up. `|| true` keeps the script alive so the OTA_MESSAGE
  # env-var fallback below can still take over.
  COMMIT_MSG="$( { grep -m 1 -v '^[[:space:]]*$' .local/.commit_message || true; } | head -c 1024 | tr -d '\r' || true)"
  if [[ -n "$COMMIT_MSG" ]]; then
    MESSAGE="$COMMIT_MSG"
    MESSAGE_SOURCE=".local/.commit_message"
  fi
fi

if [[ -z "$MESSAGE" && -n "${OTA_MESSAGE:-}" ]]; then
  MESSAGE="$OTA_MESSAGE"
  MESSAGE_SOURCE="OTA_MESSAGE env var"
fi

if [[ -n "$MESSAGE_SOURCE" ]]; then
  echo "OTA Push — message source: $MESSAGE_SOURCE"
fi

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
# Force production EXPO_PUBLIC_* into the OTA bundle.
#
# `eas update --channel production` does NOT automatically apply the
# `build.production.env` from eas.json — it uses the shell env at the
# time of bundling. The Replit workflow shell has EXPO_PUBLIC_ENV set
# to "development" (.replit userenv.development) and does not have
# EXPO_PUBLIC_API_URL / EXPO_PUBLIC_DOMAIN exported, which produced
# Android bundles missing the API URL and crashing on login.
#
# We mirror the values from `eas.json` build.production.env here so
# the bundle is always built with production env regardless of the
# host shell. Keep these in sync with eas.json.
# ---------------------------------------------------------------------------
export EXPO_PUBLIC_API_URL="https://glow-up-sports--ltvjeugd.replit.app"
export EXPO_PUBLIC_DOMAIN="glow-up-sports--ltvjeugd.replit.app"
export EXPO_PUBLIC_ENV="production"

echo "  Injected env for OTA bundle:"
echo "    EXPO_PUBLIC_API_URL = $EXPO_PUBLIC_API_URL"
echo "    EXPO_PUBLIC_DOMAIN  = $EXPO_PUBLIC_DOMAIN"
echo "    EXPO_PUBLIC_ENV     = $EXPO_PUBLIC_ENV"

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

  # --environment production tells EAS CLI (>= 13.2) to also load the
  # `build.production.env` block from eas.json into the bundling
  # environment. We already export the same vars above as a fallback in
  # case the flag is silently ignored on older CLI versions.
  npx eas update \
    --channel production \
    --environment production \
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
