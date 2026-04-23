#!/usr/bin/env bash
# =============================================================================
# scripts/test-ota-list-parser.sh
# =============================================================================
# Smoke test for scripts/ota-list-parser.js. Pipes the captured fixture at
# scripts/fixtures/eas-update-list.json through the parser and asserts:
#
#   1. Happy path — Android, runtime 1.3.5, the most recent SectionHeader
#      hotfix message → exits 0 and prints "OK id=...".
#   2. Happy path — iOS, runtime 1.3.4, same message → exits 0.
#   3. Older but still-present message ("Earlier successful push covering
#      both runtimes") on Android 1.3.5 → exits 0.
#   4. Failure path — same message but wrong runtimeVersion → exits 2
#      ("NO_MATCH").
#   5. Failure path — message that was never published → exits 2.
#   6. Failure path — wrong platform for the message → exits 2.
#
# Run manually:
#   bash scripts/test-ota-list-parser.sh
#
# Returns 0 on success, 1 if any case fails.
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE="$SCRIPT_DIR/fixtures/eas-update-list.json"
PARSER="$SCRIPT_DIR/ota-list-parser.js"

if [[ ! -f "$FIXTURE" ]]; then
  echo "Fixture not found: $FIXTURE" >&2
  exit 1
fi

PASS=0
FAIL=0

assert_case() {
  local label="$1"
  local expected_rc="$2"
  local expected_substr="$3"
  shift 3
  local out
  set +e
  out="$(node "$PARSER" "$FIXTURE" "$@" 2>/dev/null)"
  local rc=$?
  set -e
  if [[ "$rc" -eq "$expected_rc" && "$out" == *"$expected_substr"* ]]; then
    echo "  ✔ $label  (rc=$rc, out='$out')"
    PASS=$((PASS + 1))
  else
    echo "  ✘ $label  (got rc=$rc out='$out'; expected rc=$expected_rc containing '$expected_substr')" >&2
    FAIL=$((FAIL + 1))
  fi
}

HOTFIX_MSG="Hotfix — Add missing SectionHeader import in FreePlayerDiscovery (Android crash)"
EARLIER_MSG="Earlier successful push covering both runtimes"
GHOST_MSG="This message was never published anywhere"

echo "Running ota-list-parser smoke tests against $FIXTURE"
echo ""

# --- success cases --------------------------------------------------------
assert_case "android 1.3.5 hotfix"  0 "OK id=bec675da" \
  "android" "1.3.5" "$HOTFIX_MSG"

assert_case "ios 1.3.4 hotfix"      0 "OK id=6d7ba83c" \
  "ios" "1.3.4" "$HOTFIX_MSG"

assert_case "android 1.3.5 earlier" 0 "OK id=c7d5ceb5" \
  "android" "1.3.5" "$EARLIER_MSG"

# --- failure cases --------------------------------------------------------
assert_case "android wrong runtime" 2 "NO_MATCH" \
  "android" "9.9.9" "$HOTFIX_MSG"

assert_case "unknown message"       2 "NO_MATCH" \
  "android" "1.3.5" "$GHOST_MSG"

assert_case "wrong platform for ios-only rt" 2 "NO_MATCH" \
  "android" "1.3.4" "$HOTFIX_MSG"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
