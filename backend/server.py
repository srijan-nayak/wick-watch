"""
Standalone entry point for the PyInstaller-bundled WickWatch backend.

PyInstaller freezes this file into a single executable. We import `app`
directly (not via string) so that uvicorn's module-discovery works inside
the frozen bundle where importlib-based string lookups can fail.
"""
import multiprocessing
import sys
import os


def main() -> None:
    # When frozen, _MEIPASS holds the extraction directory.
    # Inserting it into sys.path ensures all bundled modules are importable.
    if getattr(sys, "frozen", False):
        bundle_dir = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
        sys.path.insert(0, bundle_dir)

    import uvicorn
    from main import app  # direct object import, not a string

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="warning",
    )


if __name__ == "__main__":
    multiprocessing.freeze_support()  # required for Windows --onefile
    main()
