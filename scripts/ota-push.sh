#!/usr/bin/env bash
# =============================================================================
# OTA Push Script — scripts/ota-push.sh
# =============================================================================
# Bundles JS once with `expo export --platform all`, then uploads the prebuilt
# bundle to EAS Update for iOS and Android. Verifies both platforms actually
# landed at the runtimeVersion configured in app.json before exiting.
#
# IMPORTANT for agents:
#   Do NOT run `eas update` directly in a bash command — it can exceed the
#   2-minute bash timeout. Trigger the "OTA Push" Replit workflow instead and
#   read its logs.
#
# OTA targeting rule (see replit.md):
#   `expo.version` and `expo.{ios,android}.runtimeVersion` are independent.
#   Bump `version` whenever you cut a new store build, but only bump
#   `runtimeVersion` when a binary at that version is actually live in the
#   store. Pushing an OTA at a runtime no installed binary uses = silently
#   dropped by every device.
#
# Usage:
#   bash scripts/ota-push.sh "Your update message here"
#   bash scripts/ota-push.sh "Your update message here" --platform ios
#   OTA_MESSAGE="Fix bug" bash scripts/ota-push.sh
#
# Message precedence: --message/positional > .local/.commit_message > $OTA_MESSAGE
#
# Knobs:
#   OTA_PLATFORM=ios|android|all   (default: all)
#   OTA_SKIP_LINT=1                (skip lint pre-flight — emergency only)
#   OTA_STRICT_LINT=1              (lint entire client/+server/ tree)
#   OTA_KEEP_DEV_SERVER=1          (don't kill Metro on :8081 during push)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Parse arguments — OTA_MESSAGE / OTA_PLATFORM env vars are fallbacks
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
    # Default mode: lint the FULL diff between the last published OTA and
    # HEAD — i.e. every file that is going to ship in this bundle, not
    # just the most recent commit. Tracked via the `ota-last-pushed` git
    # tag (written at the very end of this script after a successful
    # publish). Falls back to HEAD~10 if the tag does not exist yet.
    #
    # Why broader than HEAD~1: if 5 commits land between OTA pushes (the
    # common case), HEAD~1 only lints the last one and a no-undef bug in
    # commit N-3 ships unprotected. The whole bundle ships, so the whole
    # bundle has to lint clean.
    set +e
    LINT_BASE_REF=""
    if git rev-parse --verify --quiet 'refs/tags/ota-last-pushed' >/dev/null 2>&1; then
      LINT_BASE_REF="ota-last-pushed"
    elif git rev-parse --verify --quiet 'HEAD~10' >/dev/null 2>&1; then
      LINT_BASE_REF="HEAD~10"
    elif git rev-parse --verify --quiet 'HEAD~1' >/dev/null 2>&1; then
      LINT_BASE_REF="HEAD~1"
    fi
    echo "  Diff base : ${LINT_BASE_REF:-<none>}"
    CHANGED_FILES="$(
      {
        # Uncommitted working-tree changes
        git diff --name-only HEAD -- 'client/*' 'server/*' 2>/dev/null
        # Full diff base..HEAD (every commit in this push)
        if [[ -n "$LINT_BASE_REF" ]]; then
          git diff --name-only "$LINT_BASE_REF" HEAD -- 'client/*' 'server/*' 2>/dev/null
        fi
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

# Inject short git SHA so client/App.tsx can tag every Sentry boot event
# (`ota_commit_sha` and the `[boot] ...` breadcrumbs) with the exact commit
# that produced this OTA bundle. EXPO_PUBLIC_* must be set BEFORE
# `expo export` / `eas update` so Metro inlines it into the bundle.
# Falls back to "unknown" if git isn't available (matches App.tsx default).
RESOLVED_COMMIT_SHA="$(git rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"
export EXPO_PUBLIC_COMMIT_SHA="$RESOLVED_COMMIT_SHA"

echo "  Injected env for OTA bundle:"
echo "    EXPO_PUBLIC_API_URL        = $EXPO_PUBLIC_API_URL"
echo "    EXPO_PUBLIC_DOMAIN         = $EXPO_PUBLIC_DOMAIN"
echo "    EXPO_PUBLIC_ENV            = $EXPO_PUBLIC_ENV"
echo "    EXPO_PUBLIC_COMMIT_SHA     = $EXPO_PUBLIC_COMMIT_SHA"
echo "    NODE_OPTIONS               = $NODE_OPTIONS"

# ---------------------------------------------------------------------------
# Pause "Start App" Metro on :8081 so the bundler isn't fighting it for
# memory during the push. We don't auto-restart it — the user (or the
# agent) can re-launch the "Start App" workflow when needed; in practice
# the auto-restart trap was unreliable because Replit's process-tree
# cleanup reaped the detached child. Set OTA_KEEP_DEV_SERVER=1 to skip.
# ---------------------------------------------------------------------------
DEV_SERVER_PAUSED=0
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

# ---------------------------------------------------------------------------
# Mark this commit as the new "last published OTA" baseline so the NEXT
# push's lint pre-flight knows exactly which range to scan. We force-move
# the tag locally; we deliberately do NOT push it to origin (this is a
# script-internal marker, not a release tag).
# ---------------------------------------------------------------------------
if git rev-parse --verify --quiet HEAD >/dev/null 2>&1; then
  git tag -f ota-last-pushed HEAD >/dev/null 2>&1 \
    && echo "  ✔ moved git tag 'ota-last-pushed' → $(git rev-parse --short=12 HEAD)" \
    || echo "  ⚠ could not move 'ota-last-pushed' tag (non-fatal)"
fi
echo ""
