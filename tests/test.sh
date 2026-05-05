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

# Step 1: Build
echo "[1/4] Building graph..."
bun run "$OMNIGRAPH" build 2>&1 | tail -5
echo ""

# Step 2: Query test
echo "[2/4] Running queries..."
bun run "$OMNIGRAPH" query "." 2>&1 | head -10
echo ""

# Step 3: Check command (on first file found)
FIRST_FILE=$(bun run "$OMNIGRAPH" query "." 2>&1 | grep "^\s*\[file\]" | head -1 | sed 's/.*(\(.*\))/\1/')
if [ -n "$FIRST_FILE" ]; then
  echo "[3/4] Checking $FIRST_FILE..."
  bun run "$OMNIGRAPH" check "$FIRST_FILE" 2>&1 | head -15
else
  echo "[3/4] No file nodes found, skipping check"
fi
echo ""

# Step 4: Screenshot
echo "[4/4] Taking screenshot..."
if [ -f ".omnigraph/index.html" ]; then
  HTML_PATH="$(realpath .omnigraph/index.html)"
  SCREENSHOT="$SCREENSHOT_DIR/${TEST_NAME}_${TIMESTAMP}.png"
  $CHROMIUM --headless --disable-gpu --no-sandbox \
    --screenshot="$SCREENSHOT" \
    --window-size=1920,1080 \
    "file://$HTML_PATH" 2>&1 | grep -v "ERROR:dbus" || true
  if [ -f "$SCREENSHOT" ]; then
    SIZE=$(stat -c%s "$SCREENSHOT" 2>/dev/null || stat -f%z "$SCREENSHOT" 2>/dev/null)
    echo "Screenshot saved: $SCREENSHOT ($SIZE bytes)"
  else
    echo "WARNING: Screenshot file not created"
  fi
else
  echo "WARNING: No index.html found"
fi

echo ""
echo "=== Test complete ==="
