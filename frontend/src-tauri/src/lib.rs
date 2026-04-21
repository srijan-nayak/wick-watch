use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

// ── State ──────────────────────────────────────────────────────────────────

/// Holds the spawned uvicorn / sidecar process so we can kill it on exit.
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
            // Resolve the writable DB path (OS app-data dir).
            // Create the directory if it doesn't exist yet.
            let db_path = app
                .path()
                .app_data_dir()
                .map(|d| {
                    std::fs::create_dir_all(&d).ok();
                    d.join("wickwatch.db")
                })
                .ok();

            if let Some(ref p) = db_path {
                log::info!("[WickWatch] DB path: {}", p.display());
            }

            match spawn_backend(app.handle(), db_path.as_deref()) {
                Ok(child) => {
                    *app.state::<BackendProcess>().0.lock().unwrap() = Some(child);
                    log::info!("[WickWatch] Backend running on http://127.0.0.1:8000");
                }
                Err(e) => {
                    log::error!(
                        "[WickWatch] Could not start backend: {e}. \
                         Start uvicorn manually on port 8000."
                    );
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let maybe_child = {
                    let state = app_handle.state::<BackendProcess>();
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

// ── Backend spawning ───────────────────────────────────────────────────────

/// Spawn the FastAPI backend process.
///
/// * **Debug build** (`tauri dev`)
///   Runs `uvicorn main:app` from the project venv.
///   DB falls back to `./wickwatch.db` in the backend directory
///   (the `WICKWATCH_DB_PATH` env var is *not* set so the default is used).
///
/// * **Release build** (`tauri build`)
///   Runs the PyInstaller-bundled sidecar that lives next to this executable.
///   Sets `WICKWATCH_DB_PATH` so the DB lands in the OS app-data directory.
#[allow(unused_variables)] // app + db_path are only forwarded in release builds
fn spawn_backend(
    app: &tauri::AppHandle,
    db_path: Option<&std::path::Path>,
) -> std::io::Result<Child> {
    #[cfg(debug_assertions)]
    {
        spawn_dev_backend()
    }
    #[cfg(not(debug_assertions))]
    {
        spawn_prod_backend(app, db_path)
    }
}

// ── Development ────────────────────────────────────────────────────────────

#[cfg(debug_assertions)]
fn spawn_dev_backend() -> std::io::Result<Child> {
    let (uvicorn, backend_dir) = find_venv_uvicorn();
    log::info!("[WickWatch] DEV — spawning: {uvicorn}");

    Command::new(&uvicorn)
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
}

/// Returns `(uvicorn_path, backend_dir)`.
/// Prefers the project venv; falls back to `uvicorn` on PATH.
#[cfg(debug_assertions)]
fn find_venv_uvicorn() -> (String, std::path::PathBuf) {
    // CARGO_MANIFEST_DIR → frontend/src-tauri  (compile-time constant)
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

    log::warn!(
        "[WickWatch] .venv/bin/uvicorn not found at {}. \
         Run `npm run setup:backend` to create it.",
        backend_dir.display()
    );
    ("uvicorn".to_string(), backend_dir)
}

// ── Production ─────────────────────────────────────────────────────────────

#[cfg(not(debug_assertions))]
fn spawn_prod_backend(
    app: &tauri::AppHandle,
    db_path: Option<&std::path::Path>,
) -> std::io::Result<Child> {
    let sidecar = find_sidecar(app)?;
    log::info!("[WickWatch] PROD — spawning sidecar: {}", sidecar.display());

    let mut cmd = Command::new(&sidecar);

    if let Some(path) = db_path {
        cmd.env("WICKWATCH_DB_PATH", path.as_os_str());
    }

    cmd.spawn()
}

/// Find the bundled `backend` binary inside the Tauri resource directory.
///
/// `bundle.resources` copies `binaries/backend-<triple>` into the resource
/// dir alongside the app. We strip the triple suffix at runtime to get a
/// stable name regardless of the host platform.
#[cfg(not(debug_assertions))]
fn find_sidecar(app: &tauri::AppHandle) -> std::io::Result<std::path::PathBuf> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::NotFound, e.to_string()))?;

    // Try stable names first, then fall back to searching for backend-* glob
    for name in ["backend", "backend.exe"] {
        let p = resource_dir.join(name);
        if p.exists() {
            return Ok(p);
        }
    }

    // Search for backend-<triple> in case the resource was copied with suffix
    if let Ok(entries) = std::fs::read_dir(&resource_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let s = name.to_string_lossy();
            if s.starts_with("backend-") || s.starts_with("backend.exe") {
                return Ok(entry.path());
            }
        }
    }

    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!(
            "bundled backend not found in {}. \
             Run `npm run bundle:backend` before `npm run tauri:build`.",
            resource_dir.display()
        ),
    ))
}
