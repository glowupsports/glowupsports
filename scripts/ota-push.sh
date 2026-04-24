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
#   to the 2-minute bash tool timeout.
#
# HOW IT WORKS — bundle once, upload twice (Task #1024):
#   The expensive step is the Metro bundle (~140s cold, ~60s warm). Previously
#   we ran two full `eas update` cycles back-to-back, each with its own cold
#   Metro start, totalling 5+ minutes — consistently killed mid-Android.
#   Now:
#     1. `expo export --platform all` bundles iOS + Android in ONE Metro run.
#     2. `eas update --skip-bundler --input-dir dist --platform ios` uploads
#        the prebuilt iOS bundle (~30s).
#     3. Same for Android (~30s).
#     4. We verify both runtimes (1.3.4 iOS, 1.3.5 Android) appear in the
#        latest production updates and exit non-zero if either is missing.
#   Total wall-clock: ~3:30 instead of ~5:30.
#
#   We also stop the "Start App" workflow's Metro on port 8081 for the
#   duration of the push so the bundler isn't fighting it for memory, and
#   re-spawn `npm run expo:dev` on EXIT (best-effort, via a trap). The
#   restart is best-effort: if Replit's process-tree cleanup reaps the
#   detached child, the script also prints a hint to manually restart
#   the "Start App" workflow. Set OTA_KEEP_DEV_SERVER=1 to skip both
#   the kill and the auto-restart.
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
# EMERGENCY KILL SWITCH (Task #1289)
#
# Earlier today the OTA Push workflow re-fired automatically (post-merge of
# Task #1286 left a `.local/.commit_message`, which this script picks up as
# a publish trigger) and OVERWROTE a freshly published rollback with the
# still-broken bundle. End users force-closed again.
#
# Until the bundle crash is root-caused and a clean hotfix is staged, this
# script REFUSES to run unless the operator sets OTA_PUSH_ENABLED=1. The
# Replit "OTA Push" workflow does NOT set this flag, so accidental re-runs
# (manual or post-merge) now fail closed.
#
# To intentionally publish:
#   OTA_PUSH_ENABLED=1 OTA_MESSAGE="Hotfix XYZ" bash scripts/ota-push.sh
# ---------------------------------------------------------------------------
if [[ "${OTA_PUSH_ENABLED:-0}" != "1" ]]; then
  cat <<'OTA_DISABLED'
################################################################
#  OTA Push is DISABLED.
#
#  An emergency kill switch is in place (see scripts/ota-push.sh
#  header — Task #1289) because a recent push crashed end users
#  on cold start and an automatic re-fire overwrote the rollback.
#
#  To re-enable a single push intentionally:
#    OTA_PUSH_ENABLED=1 OTA_MESSAGE="..." bash scripts/ota-push.sh
#
#  Remove the kill switch only after the bundle crash is root-
#  caused, fixed, and a clean hotfix has been validated on a
#  bisect channel (`production-hotfix` or similar).
################################################################
OTA_DISABLED
  exit 0
fi

# ---------------------------------------------------------------------------
# Parse arguments — OTA_MESSAGE / OTA_PLATFORM env vars are fallbacks
#
# Precedence (highest → lowest):
#   1. --message flag or positional CLI argument
#   2. `.local/.commit_message` file (written by the agent for the current task)
#   3. OTA_MESSAGE environment variable (e.g. hardcoded in .replit workflow)
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
# Pre-flight — Lint guardrail (Task #1082)
#
# Why this exists: Task #1082 (missing MATCH_CARD_WIDTH) and Task #1015
# (missing SectionHeader) both shipped a one-line undeclared-identifier
# bug straight to production. ESLint's `no-undef` and `react/jsx-no-undef`
# rules catch exactly this — but only if lint actually runs and we treat
# its errors as release blockers.
#
# Strategy: lint ONLY the files this push is changing — i.e. uncommitted
# working-tree changes plus the most recent commit on HEAD — under
# `client/` and `server/`. Any no-undef / jsx-no-undef error in that set
# is a HARD abort. This protects against the regression class without
# being held hostage to ~83 pre-existing errors elsewhere in the tree
# (those are tracked for cleanup separately).
#
# Modes:
#   - Default: HARD abort on no-undef / jsx-no-undef in changed files.
#   - OTA_STRICT_LINT=1: hard abort on ANY lint error in client/+server/
#     (post-cleanup mode — flip this to default once backlog is cleared).
#   - OTA_SKIP_LINT=1: skip entirely (emergency hotfix only).
# ---------------------------------------------------------------------------
if [[ "${OTA_SKIP_LINT:-0}" == "1" ]]; then
  echo ""
  echo "  ⚠ OTA_SKIP_LINT=1 set — skipping lint pre-flight."
else
  echo ""
  echo "============================================================"
  echo "  Pre-flight — Lint guardrail (no-undef gate)"
  echo "  Time : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "============================================================"

  if [[ "${OTA_STRICT_LINT:-0}" == "1" ]]; then
    # Strict mode: lint the entire client+server tree.
    echo "  Mode  : STRICT (entire client/+server/ tree)"
    set +e
    npx expo lint client server -- --quiet > /tmp/ota-lint.log 2>&1
    LINT_RC=$?
    set -e
    if [[ $LINT_RC -eq 0 ]]; then
      echo "  ✔ lint clean"
    else
      echo "  ✘ lint FAILED (OTA_STRICT_LINT=1). See /tmp/ota-lint.log." >&2
      tail -60 /tmp/ota-lint.log >&2 || true
      exit 5
    fi
  else
    # Default mode: lint only files the current push touches.
    # "Touched" = uncommitted working-tree changes + files in HEAD's
    # last commit. Restricted to client/+server/ and js/ts source.
    set +e
    CHANGED_FILES="$(
      {
        git diff --name-only HEAD -- 'client/*' 'server/*' 2>/dev/null
        git diff --name-only HEAD~1 HEAD -- 'client/*' 'server/*' 2>/dev/null
      } \
        | grep -E '\.(ts|tsx|js|jsx)$' \
        | grep -vE '\.(test|spec)\.' \
        | grep -vE '(^|/)(__tests__|__mocks__|tests|scripts)/' \
        | sort -u \
        | tr '\n' ' '
    )"
    set -e

    if [[ -z "$CHANGED_FILES" ]]; then
      echo "  ✔ no client/ or server/ source files changed in this push — skipping."
    else
      FILE_COUNT="$(echo "$CHANGED_FILES" | wc -w | tr -d ' ')"
      echo "  Mode  : DIFF ($FILE_COUNT changed file(s))"
      echo "  Files :"
      echo "$CHANGED_FILES" | tr ' ' '\n' | sed 's/^/    /'

      set +e
      # shellcheck disable=SC2086
      npx eslint --no-warn-ignored --quiet $CHANGED_FILES > /tmp/ota-lint.log 2>&1
      LINT_RC=$?
      set -e

      if [[ $LINT_RC -eq 0 ]]; then
        echo "  ✔ lint clean — no errors in changed files"
      else
        echo "  ✘ lint FAILED on changed files. See /tmp/ota-lint.log:" >&2
        cat /tmp/ota-lint.log >&2 || true
        echo "" >&2
        echo "  Fix the errors above, or set OTA_SKIP_LINT=1 for an" >&2
        echo "  emergency hotfix that bypasses this gate." >&2
        exit 5
      fi
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Environment — memory-optimised, non-interactive CI mode
# ---------------------------------------------------------------------------
export CI=true
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=4096 --no-warnings"
export EAS_NO_VCS=1

# Force production EXPO_PUBLIC_* into the OTA bundle.
# (See historical comment: the Replit workflow shell defaults to development.)
export EXPO_PUBLIC_API_URL="https://glow-up-sports--ltvjeugd.replit.app"
export EXPO_PUBLIC_DOMAIN="glow-up-sports--ltvjeugd.replit.app"
export EXPO_PUBLIC_ENV="production"

echo "  Injected env for OTA bundle:"
echo "    EXPO_PUBLIC_API_URL = $EXPO_PUBLIC_API_URL"
echo "    EXPO_PUBLIC_DOMAIN  = $EXPO_PUBLIC_DOMAIN"
echo "    EXPO_PUBLIC_ENV     = $EXPO_PUBLIC_ENV"
echo "    NODE_OPTIONS        = $NODE_OPTIONS"

# ---------------------------------------------------------------------------
# Pause "Start App" Metro on :8081 to free memory during the push.
# We track what we killed so we can offer a restart hint at the end. We
# don't actually restart the workflow ourselves — the user (or the agent)
# can re-launch the "Start App" workflow when needed. This is intentional:
# the OTA Push workflow has no business managing other workflows' lifecycle.
#
# Set OTA_KEEP_DEV_SERVER=1 to skip this.
# ---------------------------------------------------------------------------
DEV_SERVER_PAUSED=0
DEV_RESTART_LOG="/tmp/ota-push-metro-restart.log"
if [[ "${OTA_KEEP_DEV_SERVER:-0}" != "1" ]]; then
  DEV_PIDS="$(lsof -ti:8081 2>/dev/null || true)"
  if [[ -n "$DEV_PIDS" ]]; then
    echo ""
    echo "  Pausing dev Metro on :8081 (PIDs: $DEV_PIDS) to free memory..."
    # shellcheck disable=SC2086
    kill -TERM $DEV_PIDS 2>/dev/null || true
    sleep 2
    # shellcheck disable=SC2086
    kill -KILL $DEV_PIDS 2>/dev/null || true
    DEV_SERVER_PAUSED=1
  fi
fi

# Best-effort: when this script exits (success OR failure), if we were the
# one who killed the dev Metro, try to bring it back so the next chat
# session has a working preview without the user/agent having to restart
# the "Start App" workflow manually. We re-spawn ONLY `npm run expo:dev`
# (the server side `npm run server:dev` was never killed); this matches
# what "Start App" launches. setsid + nohup detach the child from this
# script's process group so Replit's process-tree cleanup doesn't reap it
# when this workflow ends.
restore_dev_metro() {
  if [[ "$DEV_SERVER_PAUSED" != "1" ]]; then
    return
  fi
  if lsof -ti:8081 >/dev/null 2>&1; then
    # Something already came back (likely the agent restarted Start App).
    return
  fi
  echo ""
  echo "  Restarting dev Metro on :8081 (best-effort) — log: $DEV_RESTART_LOG"
  (
    setsid nohup env \
      EXPO_PACKAGER_PROXY_URL="${EXPO_PACKAGER_PROXY_URL:-https://${REPLIT_DEV_DOMAIN:-localhost}}" \
      REACT_NATIVE_PACKAGER_HOSTNAME="${REACT_NATIVE_PACKAGER_HOSTNAME:-${REPLIT_DEV_DOMAIN:-localhost}}" \
      EXPO_PUBLIC_DOMAIN="${REPLIT_DEV_DOMAIN:-localhost}:5000" \
      npm run expo:dev \
      </dev/null >"$DEV_RESTART_LOG" 2>&1 &
  ) || true
  echo "  (If preview is still empty after ~30s, restart the \"Start App\" workflow.)"
}
trap restore_dev_metro EXIT

# ---------------------------------------------------------------------------
# Step 1 — Bundle once with `expo export --platform all` (or single platform).
# This is the expensive step. Doing it ONCE for both platforms in the same
# Metro process is materially faster than two cold-start runs.
# ---------------------------------------------------------------------------
echo ""
echo "################################################################"
echo "#  OTA Push Starting"
echo "#  Platform : $PLATFORM"
echo "#  Message  : $MESSAGE"
echo "#  Time     : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "################################################################"
echo ""

EXPORT_PLATFORM="$PLATFORM"  # "ios" | "android" | "all"

echo "============================================================"
echo "  Step 1/3 — Bundling ($EXPORT_PLATFORM) into ./dist"
echo "  Time : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"

# Clean previous dist so eas update doesn't pick up stale assets.
rm -rf dist
mkdir -p dist

# Use `expo export` directly. We do NOT pass --clear to keep the Metro cache
# warm between pushes. The first push of a fresh container will rebuild the
# cache (~140s); subsequent pushes are noticeably faster.
npx expo export --platform "$EXPORT_PLATFORM" --output-dir dist

echo ""
echo ">>> bundle complete: $(du -sh dist | cut -f1) in dist/"
ls dist/_expo/static/js/ 2>/dev/null || true
echo ""

# ---------------------------------------------------------------------------
# Step 2 — Upload to EAS for each requested platform, using the prebuilt
# bundle. `--skip-bundler --input-dir dist` makes this an upload-only step.
# ---------------------------------------------------------------------------
upload_platform() {
  local platform="$1"
  echo ""
  echo "============================================================"
  echo "  Step 2/3 — Uploading $platform from ./dist"
  echo "  Channel : production"
  echo "  Time    : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "============================================================"

  # Two output streams:
  #   - /tmp/ota-push-<platform>.json  : pure JSON from --json (for parsing)
  #   - /tmp/ota-push-<platform>.log   : human-readable mirror with stderr
  # `eas update --json` writes JSON to stdout and progress messages to stderr,
  # so we split them. Pipe stderr through tee for live workflow visibility.
  set +e
  npx eas update \
    --channel production \
    --environment production \
    --message "$MESSAGE" \
    --platform "$platform" \
    --input-dir dist \
    --skip-bundler \
    --non-interactive \
    --json \
    > /tmp/ota-push-"$platform".json \
    2> >(tee /tmp/ota-push-"$platform".log >&2)
  local rc=$?
  set -e

  if [[ $rc -ne 0 ]]; then
    echo ""
    echo "ERROR: eas update failed for $platform (exit $rc). See" \
      "/tmp/ota-push-$platform.log for details." >&2
    return $rc
  fi

  # Echo the JSON into the workflow log so it stays visible alongside stderr.
  echo ""
  echo "--- eas update JSON ($platform) ---"
  cat /tmp/ota-push-"$platform".json
  echo ""
  echo ">>> $platform OTA upload complete <<<"
}

if [[ "$PLATFORM" == "ios" ]]; then
  upload_platform "ios"
elif [[ "$PLATFORM" == "android" ]]; then
  upload_platform "android"
else
  upload_platform "ios"
  upload_platform "android"
fi

# ---------------------------------------------------------------------------
# Step 3 — Verify each requested platform actually published, by parsing the
# JSON `eas update --json` already returned. This is deterministic — we know
# the exact id+runtime+platform that EAS just confirmed, so we don't have to
# fuzzy-match against `eas update:list` (which uses different field names
# and decorates message strings).
# ---------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Step 3/3 — Verifying published updates"
echo "  Time : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"

EXPECTED_IOS_RT="$(node -e "console.log(require('./app.json').expo.ios.runtimeVersion)")"
EXPECTED_ANDROID_RT="$(node -e "console.log(require('./app.json').expo.android.runtimeVersion)")"
echo "  Expected runtimes from app.json:"
echo "    iOS     = $EXPECTED_IOS_RT"
echo "    Android = $EXPECTED_ANDROID_RT"
echo ""

VERIFY_OK=1
PUBLISHED_SUMMARY=""

verify_platform() {
  local platform="$1"
  local expected_rt="$2"
  local json_file="/tmp/ota-push-$platform.json"

  if [[ ! -s "$json_file" ]]; then
    echo "  ✘ $platform: no JSON output captured at $json_file" >&2
    VERIFY_OK=0
    return
  fi

  # `eas update --json` returns an array of {id, platform, runtimeVersion,
  # group, branch, message, manifestPermalink, ...}. We pick out the entry
  # for this platform and confirm runtimeVersion matches what app.json says.
  local result
  result="$(node -e "
const fs = require('fs');
let data;
try { data = JSON.parse(fs.readFileSync('$json_file', 'utf8')); }
catch (e) { console.log('PARSE_ERR ' + e.message); process.exit(0); }
const items = Array.isArray(data) ? data : [data];
const entry = items.find(u => u && u.platform === '$platform');
if (!entry) { console.log('NO_ENTRY'); process.exit(0); }
const rt = entry.runtimeVersion;
if (rt !== '$expected_rt') {
  console.log('RT_MISMATCH got=' + rt + ' expected=$expected_rt id=' + entry.id);
  process.exit(0);
}
console.log('OK id=' + entry.id + ' rt=' + rt + ' group=' + entry.group);
")"

  if [[ "$result" == OK* ]]; then
    echo "  ✔ $platform: $result"
    PUBLISHED_SUMMARY+="${PUBLISHED_SUMMARY:+, }$platform rt $expected_rt"
  else
    echo "  ✘ $platform (expected rt $expected_rt): $result" >&2
    VERIFY_OK=0
  fi
}

if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  verify_platform "ios" "$EXPECTED_IOS_RT"
fi
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  verify_platform "android" "$EXPECTED_ANDROID_RT"
fi

echo ""
if [[ "$DEV_SERVER_PAUSED" == "1" ]]; then
  echo "  Note: dev Metro on :8081 was paused for this push."
  echo "        Restart the \"Start App\" workflow to bring it back."
  echo ""
fi

if [[ "$VERIFY_OK" != "1" ]]; then
  echo "################################################################"
  echo "#  OTA Push FAILED verification — one or more platforms missing."
  echo "#  Check /tmp/ota-push-*.log and /tmp/ota-push-*.json for details,"
  echo "#  and the Expo dashboard. Re-run the workflow to retry."
  echo "################################################################"
  exit 2
fi

# ---------------------------------------------------------------------------
# Secondary check — ask EAS for the most recent updates on the production
# branch and confirm our message + runtime show up there too. The primary
# check above is authoritative (we read the JSON EAS just confirmed at
# publish time), but a server-side roundtrip catches the rare case where
# a publish "succeeded" locally but didn't actually land on the branch
# (caching, eventual consistency, dashboard hiccups). Failures here are
# treated as HARD — exit non-zero so the workflow goes red.
# ---------------------------------------------------------------------------
echo ""
echo "  Cross-checking with eas update:list (branch=production, limit=5)..."
LIST_JSON_FILE="/tmp/ota-push-list.json"
set +e
npx eas update:list --branch production --json --non-interactive --limit 5 \
  > "$LIST_JSON_FILE" 2>/tmp/ota-push-list.err
LIST_RC=$?
set -e

if [[ $LIST_RC -ne 0 ]]; then
  echo "  ✘ eas update:list failed (exit $LIST_RC). Stderr:" >&2
  cat /tmp/ota-push-list.err >&2 || true
  exit 3
fi

LIST_OK=1
list_check() {
  local platform="$1"
  local expected_rt="$2"
  # Delegate to scripts/ota-list-parser.js which understands the real
  # `eas update:list --json` shape ({ currentPage: [...] }, `platforms`
  # as a singular string, and messages wrapped in quotes + decorated
  # with " (N <unit> ago by ...)"). Keeping the parser in its own file
  # lets us unit-test it via scripts/test-ota-list-parser.sh.
  local result
  local stderr_file
  stderr_file="$(mktemp)"
  set +e
  result="$(node scripts/ota-list-parser.js \
    "$LIST_JSON_FILE" "$platform" "$expected_rt" "$MESSAGE" 2>"$stderr_file")"
  local rc=$?
  set -e
  if [[ $rc -eq 0 && "$result" == OK* ]]; then
    echo "    ✔ list check $platform (rt $expected_rt): $result"
  else
    echo "    ✘ list check $platform (rt $expected_rt): $result" >&2
    if [[ -s "$stderr_file" ]]; then
      sed 's/^/      /' "$stderr_file" >&2
    fi
    LIST_OK=0
  fi
  rm -f "$stderr_file"
}

if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  list_check "ios" "$EXPECTED_IOS_RT"
fi
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  list_check "android" "$EXPECTED_ANDROID_RT"
fi

if [[ "$LIST_OK" != "1" ]]; then
  echo "################################################################"
  echo "#  OTA Push CROSS-CHECK FAILED — eas update:list does not show"
  echo "#  the expected runtime+message on production. Inspect" >&2
  echo "#  $LIST_JSON_FILE and the Expo dashboard before re-publishing."
  echo "################################################################"
  exit 4
fi

echo "################################################################"
echo "#  OTA Push Finished Successfully"
echo "#  Published: $PUBLISHED_SUMMARY"
echo "#  Message  : $MESSAGE"
echo "################################################################"
echo ""
