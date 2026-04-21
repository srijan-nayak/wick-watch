# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for the WickWatch FastAPI backend.
Run via:
    .venv/bin/pyinstaller --clean --noconfirm server.spec
Output: dist/backend  (single-file executable)
"""
from PyInstaller.utils.hooks import collect_all, collect_submodules

all_datas, all_binaries, all_hiddenimports = [], [], []

# Heavy packages whose sub-modules PyInstaller misses without help
for pkg in [
    "uvicorn",
    "fastapi",
    "starlette",
    "sqlmodel",
    "sqlalchemy",
    "aiosqlite",
    "anyio",
    "ta",
    "pandas",
    "numpy",
    "kiteconnect",
]:
    d, b, h = collect_all(pkg)
    all_datas      += d
    all_binaries   += b
    all_hiddenimports += h

a = Analysis(
    ["server.py"],
    pathex=["."],
    binaries=all_binaries,
    datas=all_datas,
    hiddenimports=all_hiddenimports + [
        # uvicorn internals
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.protocols.websockets.websockets_impl",
        "uvicorn.protocols.websockets.wsproto_impl",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # stdlib extras
        "email.mime",
        "email.mime.text",
        "email.mime.multipart",
        # our own application modules (all must be importable from bundle)
        "main",
        "api.routes",
        "api.auth",
        "api.backtest",
        "api.live",
        "api.ws",
        "api.state",
        "db.models",
        "dsl.parser",
        "dsl.validator",
        "dsl.compiler",
        "dsl.lexer",
        "dsl.ast_nodes",
        "executor.engine",
        "indicators.registry",
        "kite.client",
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,          # UPX can break some native extensions
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
