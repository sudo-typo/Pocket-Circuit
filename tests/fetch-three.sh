#!/usr/bin/env bash
# Fetches a local copy of three@0.160.0's module build for the Playwright
# tests to serve in place of the jsdelivr CDN (which the test container's
# network policy blocks). Never used by the game itself.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_DIR="$SCRIPT_DIR/.vendor"
TARGET="$VENDOR_DIR/three.module.min.js"

if [ -f "$TARGET" ]; then
  echo "three.module.min.js already present at $TARGET"
  exit 0
fi

mkdir -p "$VENDOR_DIR"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Fetching three@0.160.0 via npm pack..."
(cd "$TMP_DIR" && npm pack three@0.160.0 --silent)

TARBALL="$(find "$TMP_DIR" -name 'three-0.160.0.tgz' | head -n1)"
if [ -z "$TARBALL" ]; then
  echo "npm pack did not produce three-0.160.0.tgz" >&2
  exit 1
fi

tar -xzf "$TARBALL" -C "$TMP_DIR" package/build/three.module.min.js
cp "$TMP_DIR/package/build/three.module.min.js" "$TARGET"

echo "Saved $TARGET"
