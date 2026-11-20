//! Watches the Git metadata of a repository (not its working files) with `notify`.
//! One watcher per Git folder: a linked worktree has its own folder plus the shared one that holds the refs.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};

use crate::application::git_watch::{Debouncer, is_relevant};
use crate::domain::error::{AppError, ErrorKind};

const DEBOUNCE_MS: u64 = 300;

/// Dropping the handle stops watching.
pub struct GitWatchHandle {
    _watchers: Vec<RecommendedWatcher>,
}

fn io_error(message: impl Into<String>) -> AppError {
    AppError::new(ErrorKind::Io, message)
}

/// Lowercase, forward slashes and no `\?\` prefix, so paths from Git and from the OS compare equal.
fn normalized(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    text.strip_prefix("//?/").unwrap_or(&text).to_lowercase()
}

/// `path` relative to `base`, when it lies inside it.
fn relative_to(base: &str, path: &Path) -> Option<PathBuf> {
    let full = normalized(path);
    let rest = full.strip_prefix(base)?;
    rest.strip_prefix('/').map(PathBuf::from)
}

/// The Git folder of `root` and, for a linked worktree, the common folder that holds the shared refs.
fn git_dirs(root: &Path) -> Result<Vec<PathBuf>, AppError> {
    let output = Command::new("git")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .arg("-C")
        .arg(root)
        .args(["rev-parse", "--absolute-git-dir", "--git-common-dir"])
        .output()
        .map_err(|e| io_error(format!("Could not run Git: {e}")))?;
    if !output.status.success() {
        return Err(io_error(String::from_utf8_lossy(&output.stderr).trim().to_string()));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut lines = text.lines();
    let git_dir = PathBuf::from(lines.next().ok_or_else(|| io_error("Git gave no folder"))?.trim());
    let mut dirs = vec![git_dir];
    if let Some(common) = lines.next().map(str::trim).filter(|c| !c.is_empty()) {
        let common = Path::new(common);
        let common = if common.is_absolute() { common.to_path_buf() } else { root.join(common) };
        let common = std::fs::canonicalize(&common).unwrap_or(common);
        if normalized(&common) != normalized(&dirs[0]) {
            dirs.push(common);
        }
    }
    Ok(dirs)
}

/// Call `on_change` (from a background thread) after the repository's HEAD, index or refs changed.
pub fn watch(root: &Path, on_change: Box<dyn Fn() + Send + Sync>) -> Result<GitWatchHandle, AppError> {
    let dirs = git_dirs(root)?;
    let (sender, receiver) = mpsc::channel::<()>();
    let mut watchers = Vec::new();
    for dir in &dirs {
        let base = normalized(dir);
        let sender = sender.clone();
        let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
            let Ok(event) = event else { return };
            if event.paths.iter().any(|path| relative_to(&base, path).is_some_and(|rel| is_relevant(&rel))) {
                let _ = sender.send(());
            }
        })
        .map_err(|e| io_error(format!("Could not watch Git: {e}")))?;
        watcher
            .watch(dir, RecursiveMode::NonRecursive)
            .map_err(|e| io_error(format!("Could not watch {}: {e}", dir.display())))?;
        let refs = dir.join("refs");
        if refs.is_dir() {
            let _ = watcher.watch(&refs, RecursiveMode::Recursive);
        }
        watchers.push(watcher);
    }
    // Only the watchers hold senders now; when they are dropped the thread below ends.
    drop(sender);

    std::thread::spawn(move || {
        let started = Instant::now();
        let mut debouncer = Debouncer::new(DEBOUNCE_MS);
        loop {
            let now = || started.elapsed().as_millis() as u64;
            match receiver.recv_timeout(Duration::from_millis(25)) {
                Ok(()) => debouncer.record(now()),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
            if debouncer.take_due(now()) {
                on_change();
            }
        }
    });
    Ok(GitWatchHandle { _watchers: watchers })
}
