use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

// ── State ──────────────────────────────────────────────────────────────────

/// Holds the spawned uvicorn process so we can kill it on app exit.
struct BackendProcess(Mutex<Option<Child>>);

// ── Entry point ────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            let (uvicorn_cmd, backend_dir) = resolve_backend();
            log::info!("[WickWatch] Starting backend: {uvicorn_cmd}");

            match Command::new(&uvicorn_cmd)
                .args([
                    "main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8000",
                    "--log-level",
                    "warning",
                ])
                .current_dir(&backend_dir)
                .spawn()
            {
                Ok(child) => {
                    *app.state::<BackendProcess>().0.lock().unwrap() = Some(child);
                    log::info!("[WickWatch] Backend running on http://127.0.0.1:8000");
                }
                Err(e) => {
                    // Non-fatal: the user can start uvicorn manually.
                    log::error!(
                        "[WickWatch] Could not start backend ({e}). \
                         Start `uvicorn main:app --port 8000` manually inside the backend/ directory."
                    );
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Extract the child in its own scope so the MutexGuard
                // (and the `state` borrow) are dropped before we use `child`.
                let maybe_child = {
                    let state = app_handle.state::<BackendProcess>();
                    // Assign to a named binding so the MutexGuard drops at the
                    // semicolon — before `state` itself is dropped at `}`.
                    let child = state.0.lock().unwrap().take();
                    child
                };
                if let Some(mut child) = maybe_child {
                    log::info!("[WickWatch] Stopping backend…");
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}

// ── Helpers ────────────────────────────────────────────────────────────────

/// Returns `(uvicorn_executable, backend_working_dir)`.
///
/// Resolution order:
///   1. `<project_root>/backend/.venv/bin/uvicorn`  (project venv — preferred)
///   2. `uvicorn` on PATH  (system install)
///
/// `CARGO_MANIFEST_DIR` is baked in at compile time and points to
/// `frontend/src-tauri/`, so the backend is two directories up.
fn resolve_backend() -> (String, std::path::PathBuf) {
    let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));

    // src-tauri/ → frontend/ → project root → backend/
    let backend_dir = manifest
        .parent() // frontend/
        .and_then(|p| p.parent()) // project root
        .map(|p| p.join("backend"))
        .unwrap_or_else(|| std::path::PathBuf::from("backend"));

    let venv_uvicorn = backend_dir.join(".venv/bin/uvicorn");
    if venv_uvicorn.exists() {
        return (venv_uvicorn.to_string_lossy().into_owned(), backend_dir);
    }

    // Fallback: hope it is on PATH
    ("uvicorn".to_string(), backend_dir)
}
