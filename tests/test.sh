#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OMNIGRAPH="$PROJECT_DIR/omnigraph.ts"
CHROMIUM="/nix/store/i7spvxzkwv2xs0j6n2k8lwjs1k6b7mab-chromium-147.0.7727.101/bin/chromium"
SCREENSHOT_DIR="$SCRIPT_DIR/screenshots"

mkdir -p "$SCREENSHOT_DIR"

TARGET_DIR="${1:-.}"
TEST_NAME="${2:-$(basename "$TARGET_DIR")}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

echo "=== OmniGraph Test: $TEST_NAME ==="
echo "Target: $TARGET_DIR"
echo "Timestamp: $TIMESTAMP"
echo ""

cd "$TARGET_DIR"

PASS=0
FAIL=0

run_test() {
  local label="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    echo "  ✓ $label"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label"
    FAIL=$((FAIL + 1))
  fi
}

echo "[1/7] Building graph..."
OUTPUT=$(bun run "$OMNIGRAPH" build 2>&1)
if echo "$OUTPUT" | grep -q "nodes.*edges"; then
  echo "  ✓ Build succeeded"
  PASS=$((PASS + 1))
else
  echo "  ✗ Build failed"
  FAIL=$((FAIL + 1))
fi
echo ""

echo "[2/7] Running queries..."
run_test "Query '.' returns nodes" bun run "$OMNIGRAPH" query "."
echo ""

echo "[3/7] Testing search..."
FIRST_FN=$(bun run "$OMNIGRAPH" query "." 2>&1 | grep "^\s*\[function\]" | head -1 | sed 's/.*\] \([^ ]*\).*/\1/' || true)
if [ -n "$FIRST_FN" ]; then
  SEARCH_TERM=$(echo "$FIRST_FN" | cut -d: -f2 | cut -d. -f1)
  run_test "Search '$SEARCH_TERM'" bun run "$OMNIGRAPH" search "$SEARCH_TERM"
else
  echo "  - No functions found, skipping search"
fi
echo ""

echo "[4/7] Testing check..."
FIRST_FILE=$(bun run "$OMNIGRAPH" query "." 2>&1 | grep "^\s*\[file\]" | head -1 | sed 's/.*(\(.*\))/\1/')
if [ -n "$FIRST_FILE" ]; then
  run_test "Check $FIRST_FILE" bun run "$OMNIGRAPH" check "$FIRST_FILE"
fi
echo ""

echo "[5/7] Testing hotspots..."
run_test "Hotspots command" bun run "$OMNIGRAPH" hotspots
echo ""

echo "[6/7] Testing orphans..."
run_test "Orphans command" bun run "$OMNIGRAPH" orphans
echo ""

echo "[7/7] Taking screenshot..."
if [ -f ".omnigraph/index.html" ]; then
  HTML_PATH="$(realpath .omnigraph/index.html)"
  SCREENSHOT="$SCREENSHOT_DIR/${TEST_NAME}_${TIMESTAMP}.png"
  $CHROMIUM --headless --disable-gpu --no-sandbox \
    --screenshot="$SCREENSHOT" \
    --window-size=1920,1080 \
    "file://$HTML_PATH" 2>&1 | grep -v "ERROR:dbus" || true
  if [ -f "$SCREENSHOT" ]; then
    SIZE=$(stat -c%s "$SCREENSHOT" 2>/dev/null || stat -f%z "$SCREENSHOT" 2>/dev/null)
    echo "  ✓ Screenshot: $SCREENSHOT ($SIZE bytes)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ Screenshot failed"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ✗ No index.html found"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit $FAIL
