#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Ensure a sidecar binary exists at the path Tauri expects so that
# `cargo check` / `tauri dev` can compile without running PyInstaller first.
#
# * If the real PyInstaller binary already exists, this is a no-op.
# * If it does not, a tiny placeholder shell script is created so the Tauri
#   build-script's resource-glob validation passes.
#
# In development, Rust's #[cfg(debug_assertions)] branch uses .venv/uvicorn
# directly and never executes the sidecar, so the placeholder is never run.
# In production, `bundle_backend.sh` overwrites the placeholder with the real
# PyInstaller binary before `tauri build` runs.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARIES_DIR="$ROOT/frontend/src-tauri/binaries"
TRIPLE=$(rustc -Vv | grep "^host:" | awk '{print $2}')
TARGET="$BINARIES_DIR/backend-$TRIPLE"

mkdir -p "$BINARIES_DIR"

if [ -f "$TARGET" ]; then
    echo "[ensure-sidecar] $TARGET already exists — skipping."
else
    printf '#!/bin/sh\necho "WickWatch backend placeholder — run npm run bundle:backend to build the real sidecar"\n' \
        > "$TARGET"
    chmod +x "$TARGET"
    echo "[ensure-sidecar] Created placeholder at $TARGET"
fi
