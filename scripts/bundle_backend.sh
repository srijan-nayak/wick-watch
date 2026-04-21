#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Bundle the WickWatch FastAPI backend into a single executable using
# PyInstaller, then place it in src-tauri/binaries/ with the Rust target-triple
# suffix that Tauri expects for sidecar binaries.
#
# Usage (from any directory):
#   ./scripts/bundle_backend.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"
BINARIES_DIR="$ROOT_DIR/frontend/src-tauri/binaries"

# ── 1. Target triple ──────────────────────────────────────────────────────────
TARGET_TRIPLE=$(rustc -Vv | grep "^host:" | awk '{print $2}')
echo "[bundle-backend] Target triple : $TARGET_TRIPLE"

# ── 2. Ensure venv exists ─────────────────────────────────────────────────────
VENV="$BACKEND_DIR/.venv"
PYTHON="$VENV/bin/python"
PIP="$VENV/bin/pip"

if [ ! -f "$PYTHON" ]; then
    echo "[bundle-backend] Creating venv with $(python3 --version)…"
    python3 -m venv "$VENV"
fi

PYTHON_VERSION=$("$PYTHON" --version 2>&1)
echo "[bundle-backend] Python        : $PYTHON_VERSION"

# ── 3. Install / refresh dependencies ────────────────────────────────────────
echo "[bundle-backend] Installing requirements + pyinstaller…"
"$PIP" install -q --upgrade pip
"$PIP" install -q -r "$BACKEND_DIR/requirements.txt"
"$PIP" install -q pyinstaller

# ── 4. Run PyInstaller ────────────────────────────────────────────────────────
echo "[bundle-backend] Running PyInstaller…"
cd "$BACKEND_DIR"
"$VENV/bin/pyinstaller" --clean --noconfirm server.spec

# ── 5. Copy binary with Tauri sidecar naming convention ──────────────────────
mkdir -p "$BINARIES_DIR"
DEST="$BINARIES_DIR/backend-$TARGET_TRIPLE"
cp "$BACKEND_DIR/dist/backend" "$DEST"
chmod +x "$DEST"

echo "[bundle-backend] ✓ Binary written to $DEST"
echo "[bundle-backend] Size: $(du -sh "$DEST" | awk '{print $1}')"
