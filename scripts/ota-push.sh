#!/usr/bin/env bash
# =============================================================================
# OTA Push Script — scripts/ota-push.sh
# =============================================================================
# Bundles JS once with `expo export --platform all`, then uploads the prebuilt
# bundle to EAS Update for each (platform, runtimeVersion) pair declared in
# `scripts/live-runtimes.json`. Verifies every requested combination actually
# landed before exiting.
#
# IMPORTANT for agents:
#   Do NOT run `eas update` directly in a bash command — it can exceed the
#   2-minute bash timeout. Trigger the "OTA Push" Replit workflow instead and
#   read its logs.
#
# DUAL-RUNTIME RULE (Task #1372):
#   `eas update` only publishes to the runtimeVersion currently declared in
#   app.json. Pushing an OTA at a runtime no installed binary uses = silently
#   dropped by every device. This script reads `scripts/live-runtimes.json`
#   to know every runtime that actually lives on real devices, and publishes
#   the same bundle to ALL of them by temporarily mutating app.json's
#   runtimeVersion between uploads. The original app.json is restored on exit.
#
# Why app.json mutation: `eas update` does NOT accept a `--runtime-version`
# flag (verified Apr 2026, EAS CLI 16.x). The runtime is read from app.json
# at publish time. Mutating + restoring is the supported pattern for cross-
# runtime publishing of the same bundle.
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
# Pre-flight — Load live-runtimes config
# ---------------------------------------------------------------------------
LIVE_RUNTIMES_FILE="scripts/live-runtimes.json"
if [[ ! -f "$LIVE_RUNTIMES_FILE" ]]; then
  echo "ERROR: $LIVE_RUNTIMES_FILE not found. Cannot determine target runtimes." >&2
  exit 1
fi

# Read iOS + Android runtime arrays. Each is a JSON array of strings.
IOS_RUNTIMES_JSON="$(node -e "
const cfg = require('./$LIVE_RUNTIMES_FILE');
if (!Array.isArray(cfg.ios) || cfg.ios.length === 0) {
  console.error('live-runtimes.json: ios must be a non-empty array');
  process.exit(1);
}
console.log(JSON.stringify(cfg.ios));
")"
ANDROID_RUNTIMES_JSON="$(node -e "
const cfg = require('./$LIVE_RUNTIMES_FILE');
if (!Array.isArray(cfg.android) || cfg.android.length === 0) {
  console.error('live-runtimes.json: android must be a non-empty array');
  process.exit(1);
}
console.log(JSON.stringify(cfg.android));
")"

# Convert JSON arrays to bash arrays (one runtime per line, no quotes).
mapfile -t IOS_RUNTIMES < <(node -e "console.log(JSON.parse(process.argv[1]).join('\n'))" "$IOS_RUNTIMES_JSON")
mapfile -t ANDROID_RUNTIMES < <(node -e "console.log(JSON.parse(process.argv[1]).join('\n'))" "$ANDROID_RUNTIMES_JSON")

echo ""
echo "  Live runtimes (from $LIVE_RUNTIMES_FILE):"
echo "    iOS     = ${IOS_RUNTIMES[*]}"
echo "    Android = ${ANDROID_RUNTIMES[*]}"

# ---------------------------------------------------------------------------
# Cross-runtime safety filter (Task #1374)
#
# WHY: Task #1372 introduced fan-out — the same JS bundle was published to
# every runtime listed in live-runtimes.json by mutating app.json between
# uploads. That shipped a bundle compiled against the 1.3.6 native API
# surface to 1.3.4 / 1.3.5 iOS binaries on 2026-04-26 and made the player
# home effectively unusable on those installs (#1374). JS bundles are not
# runtime-agnostic: they import from native modules whose method shapes
# can differ between runtimes, and a mismatch can manifest as runaway JS
# work, blocked bridges, or reload loops.
#
# RULE: An OTA bundle may only be published to the runtime declared in
#       app.json at bundle time — i.e. the runtime the bundle was actually
#       built against. Fan-out to additional runtimes requires either
#       (a) a per-runtime rebuild from a matching git tag (not yet wired
#       up — see follow-up), or (b) an explicit emergency override
#       (OTA_ALLOW_CROSS_RUNTIME=1) which restores the dangerous old
#       behavior with a giant warning.
#
# This filter rewrites IOS_RUNTIMES / ANDROID_RUNTIMES in place so the
# rest of the script (publish loop + verification) needs no other change.
# ---------------------------------------------------------------------------
APP_IOS_RT="$(node -e "
const cfg = require('./app.json');
const v = cfg.expo && cfg.expo.ios && cfg.expo.ios.runtimeVersion;
if (!v) { console.error('app.json missing expo.ios.runtimeVersion'); process.exit(1); }
console.log(v);
")"
APP_ANDROID_RT="$(node -e "
const cfg = require('./app.json');
const v = cfg.expo && cfg.expo.android && cfg.expo.android.runtimeVersion;
if (!v) { console.error('app.json missing expo.android.runtimeVersion'); process.exit(1); }
console.log(v);
")"

ALLOW_CROSS_RUNTIME="${OTA_ALLOW_CROSS_RUNTIME:-0}"

echo ""
echo "  Bundle source-of-truth runtime (from app.json):"
echo "    iOS     = $APP_IOS_RT"
echo "    Android = $APP_ANDROID_RT"

# filter_runtimes — emits kept runtimes on stdout (one per line); warnings
# on stderr. Refuses to emit cross-runtime targets unless the operator
# explicitly set OTA_ALLOW_CROSS_RUNTIME=1.
filter_runtimes() {
  local platform="$1"
  local source_rt="$2"
  shift 2
  local kept=()
  local skipped=()
  local rt
  for rt in "$@"; do
    if [[ "$rt" == "$source_rt" ]]; then
      kept+=("$rt")
    else
      skipped+=("$rt")
    fi
  done

  if [[ ${#skipped[@]} -gt 0 && "$ALLOW_CROSS_RUNTIME" == "1" ]]; then
    {
      echo ""
      echo "  ################################################################"
      echo "  #  ⚠  DANGER — OTA_ALLOW_CROSS_RUNTIME=1"
      echo "  ################################################################"
      echo "  Publishing this $platform bundle (built against $source_rt) to"
      echo "  cross-runtime targets: ${skipped[*]}"
      echo ""
      echo "  This is exactly the configuration that broke the player home on"
      echo "  iOS 1.3.4 / 1.3.5 on 2026-04-26 (Task #1374). Only proceed if"
      echo "  you have manually verified the bundle imports nothing whose"
      echo "  native API shape differs between runtimes, or you have already"
      echo "  notified users."
      echo "  ################################################################"
    } >&2
    printf '%s\n' "$@"
    return 0
  fi

  if [[ ${#skipped[@]} -gt 0 ]]; then
    {
      echo ""
      echo "  ⚠ Cross-runtime safety: skipping $platform runtime(s) that don't match"
      echo "    app.json's $platform.runtimeVersion ($source_rt):"
      for rt in "${skipped[@]}"; do
        echo "      - $rt   (would receive a bundle built against $source_rt)"
      done
      echo "    To publish to these runtimes safely, build a per-runtime bundle from"
      echo "    the matching source tag and re-run. Emergency override:"
      echo "      OTA_ALLOW_CROSS_RUNTIME=1 bash scripts/ota-push.sh \"...\""
      echo "    See Task #1374 / docs/eas-update-audit.md for context."
    } >&2
  fi

  if [[ ${#kept[@]} -eq 0 ]]; then
    {
      echo ""
      echo "  ✘ ERROR: no $platform runtime in $LIVE_RUNTIMES_FILE matches" >&2
      echo "    app.json's $platform.runtimeVersion ($source_rt). The publish" >&2
      echo "    would silently reach 0 devices." >&2
      echo "" >&2
      echo "    Fix one of:" >&2
      echo "      - Add \"$source_rt\" to live-runtimes.json's $platform array" >&2
      echo "        (only if a binary at that runtime is actually live in store)." >&2
      echo "      - Roll app.json's $platform.runtimeVersion back to a runtime" >&2
      echo "        that IS already live." >&2
      echo "      - Skip $platform on this push: --platform <other>" >&2
    } >&2
    return 1
  fi

  printf '%s\n' "${kept[@]}"
}

if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  if ! IOS_FILTERED_RAW="$(filter_runtimes "ios" "$APP_IOS_RT" "${IOS_RUNTIMES[@]}")"; then
    exit 6
  fi
  mapfile -t IOS_RUNTIMES <<< "$IOS_FILTERED_RAW"
fi
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  if ! ANDROID_FILTERED_RAW="$(filter_runtimes "android" "$APP_ANDROID_RT" "${ANDROID_RUNTIMES[@]}")"; then
    exit 6
  fi
  mapfile -t ANDROID_RUNTIMES <<< "$ANDROID_FILTERED_RAW"
fi

echo ""
echo "  After cross-runtime safety filter:"
echo "    iOS     → ${IOS_RUNTIMES[*]:-<none>}"
echo "    Android → ${ANDROID_RUNTIMES[*]:-<none>}"

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
# Snapshot app.json so we can restore it after mutating runtimeVersion
# between per-runtime publishes. Trap EXIT so we ALWAYS restore — including
# if eas fails halfway, the user Ctrl-Cs, or anything else goes wrong.
# ---------------------------------------------------------------------------
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
# Metro process is materially faster than two cold-start runs. The bundle
# itself is runtime-agnostic — runtimeVersion is set by `eas update` at
# publish time from whatever app.json says at that moment.
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
# Helper — set runtimeVersion in app.json for ONE platform to a target value.
# Uses node so we round-trip valid JSON instead of regex-mauling it.
# ---------------------------------------------------------------------------
set_app_json_runtime() {
  local platform="$1"   # "ios" | "android"
  local target_rt="$2"  # e.g. "1.3.5"
  node -e "
const fs = require('fs');
const path = './app.json';
const cfg = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!cfg.expo) throw new Error('app.json has no expo block');
if (!cfg.expo['$platform']) cfg.expo['$platform'] = {};
cfg.expo['$platform'].runtimeVersion = '$target_rt';
fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
"
}

# ---------------------------------------------------------------------------
# Step 2 — For each (platform, runtime) pair, mutate app.json's runtimeVersion
# and publish. This is the dual-runtime publish loop introduced in #1372.
#
# Why per-runtime: see DUAL-RUNTIME RULE comment at top. eas update reads the
# runtime from app.json at publish time and offers no override flag, so we
# briefly mutate the file. The EXIT trap restores the original.
# ---------------------------------------------------------------------------
PUBLISHED_KEYS=()  # tracks "<platform>-<runtime>" strings we successfully published

upload_platform_runtime() {
  local platform="$1"
  local target_rt="$2"

  echo ""
  echo "============================================================"
  echo "  Step 2/3 — Uploading $platform @ runtime $target_rt"
  echo "  Channel : production"
  echo "  Time    : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "============================================================"

  set_app_json_runtime "$platform" "$target_rt"

  local json_file="/tmp/ota-push-${platform}-${target_rt}.json"
  local log_file="/tmp/ota-push-${platform}-${target_rt}.log"

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
    > "$json_file" \
    2> >(tee "$log_file" >&2)
  local rc=$?
  set -e

  if [[ $rc -ne 0 ]]; then
    echo ""
    echo "ERROR: eas update failed for $platform @ $target_rt (exit $rc)." >&2
    echo "       See $log_file for details." >&2
    return $rc
  fi

  echo ""
  echo "--- eas update JSON ($platform @ $target_rt) ---"
  cat "$json_file"
  echo ""
  echo ">>> $platform @ $target_rt OTA upload complete <<<"

  PUBLISHED_KEYS+=("${platform}-${target_rt}")
}

if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  for rt in "${IOS_RUNTIMES[@]}"; do
    upload_platform_runtime "ios" "$rt"
  done
fi
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  for rt in "${ANDROID_RUNTIMES[@]}"; do
    upload_platform_runtime "android" "$rt"
  done
fi

# Restore app.json now that all per-runtime publishes are done. The EXIT
# trap will also restore on any failure — this is the success-path restore.
restore_app_json
trap - EXIT

# ---------------------------------------------------------------------------
# Step 3 — Verify each requested (platform, runtime) actually published, by
# parsing the JSON `eas update --json` already returned. This is determin-
# istic — we know the exact id+runtime+platform that EAS just confirmed.
# ---------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Step 3/3 — Verifying published updates"
echo "  Time : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"

VERIFY_OK=1
PUBLISHED_SUMMARY=""

verify_platform_runtime() {
  local platform="$1"
  local expected_rt="$2"
  local json_file="/tmp/ota-push-${platform}-${expected_rt}.json"

  if [[ ! -s "$json_file" ]]; then
    echo "  ✘ $platform @ $expected_rt: no JSON output captured at $json_file" >&2
    VERIFY_OK=0
    return
  fi

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
    echo "  ✔ $platform @ $expected_rt: $result"
    PUBLISHED_SUMMARY+="${PUBLISHED_SUMMARY:+, }$platform rt $expected_rt"
  else
    echo "  ✘ $platform @ $expected_rt: $result" >&2
    VERIFY_OK=0
  fi
}

if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  for rt in "${IOS_RUNTIMES[@]}"; do
    verify_platform_runtime "ios" "$rt"
  done
fi
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  for rt in "${ANDROID_RUNTIMES[@]}"; do
    verify_platform_runtime "android" "$rt"
  done
fi

echo ""
if [[ "$DEV_SERVER_PAUSED" == "1" ]]; then
  echo "  Note: dev Metro on :8081 was paused for this push."
  echo "        Restart the \"Start App\" workflow to bring it back."
  echo ""
fi

if [[ "$VERIFY_OK" != "1" ]]; then
  echo "################################################################"
  echo "#  OTA Push FAILED verification — one or more (platform,runtime)"
  echo "#  pairs missing. Check /tmp/ota-push-*.log and /tmp/ota-push-*.json"
  echo "#  for details, and the Expo dashboard. Re-run the workflow to retry."
  echo "################################################################"
  exit 2
fi

# ---------------------------------------------------------------------------
# Secondary check — ask EAS for the most recent updates on the production
# branch and confirm our message + every requested runtime show up there too.
# The primary check above is authoritative (we read the JSON EAS just
# confirmed at publish time), but a server-side roundtrip catches the rare
# case where a publish "succeeded" locally but didn't actually land on the
# branch (caching, eventual consistency, dashboard hiccups). Failures here
# are treated as HARD — exit non-zero so the workflow goes red.
#
# We bump --limit to cover N publishes worth of recent rows so list_check
# can find every (platform, runtime) we just pushed.
# ---------------------------------------------------------------------------
echo ""
TOTAL_PUSHES=${#PUBLISHED_KEYS[@]}
LIST_LIMIT=$(( TOTAL_PUSHES * 2 + 5 ))
echo "  Cross-checking with eas update:list (branch=production, limit=$LIST_LIMIT)..."
LIST_JSON_FILE="/tmp/ota-push-list.json"
set +e
npx eas update:list --branch production --json --non-interactive --limit "$LIST_LIMIT" \
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
  local result
  local stderr_file
  stderr_file="$(mktemp)"
  set +e
  result="$(node scripts/ota-list-parser.js \
    "$LIST_JSON_FILE" "$platform" "$expected_rt" "$MESSAGE" 2>"$stderr_file")"
  local rc=$?
  set -e
  if [[ $rc -eq 0 && "$result" == OK* ]]; then
    echo "    ✔ list check $platform @ $expected_rt: $result"
  else
    echo "    ✘ list check $platform @ $expected_rt: $result" >&2
    if [[ -s "$stderr_file" ]]; then
      sed 's/^/      /' "$stderr_file" >&2
    fi
    LIST_OK=0
  fi
  rm -f "$stderr_file"
}

if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  for rt in "${IOS_RUNTIMES[@]}"; do
    list_check "ios" "$rt"
  done
fi
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  for rt in "${ANDROID_RUNTIMES[@]}"; do
    list_check "android" "$rt"
  done
fi

if [[ "$LIST_OK" != "1" ]]; then
  echo "################################################################"
  echo "#  OTA Push CROSS-CHECK FAILED — eas update:list does not show"
  echo "#  every expected (platform,runtime) on production. Inspect" >&2
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
