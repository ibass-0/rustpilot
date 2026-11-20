//! Thin Tauri wrappers over the use cases. `async` keeps I/O off the main
//! thread so the window never freezes.

use std::path::{Path, PathBuf};

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::application::terminal::{TerminalSessions, available_shells};
use crate::application::{fs as file_use_cases, git as git_use_cases};
use crate::domain::error::{AppError, ErrorKind};
use crate::domain::fs::{DirEntry, FileContent, LineEnding};
use crate::domain::git::GitStatus;
use crate::domain::ports::{EventSink, FileSystem, GitRepository, ProgramLocator, PtySpawner};
use crate::domain::terminal::{ShellProfile, TerminalEvent, TerminalSize};

/// The file system the commands work against, chosen by the composition root
/// in `lib.rs` so this layer never names a concrete adapter.
pub struct FileSystemState(pub Box<dyn FileSystem + Send + Sync>);

pub struct GitState(pub Box<dyn GitRepository>);

/// Everything the terminal commands need, wired in `lib.rs`.
pub struct TerminalState {
    pub sessions: TerminalSessions,
    pub spawner: Box<dyn PtySpawner>,
    pub locator: Box<dyn ProgramLocator + Send + Sync>,
}

#[tauri::command(async)]
pub fn list_dir(fs: State<'_, FileSystemState>, path: String) -> Result<Vec<DirEntry>, AppError> {
    file_use_cases::list_dir(fs.0.as_ref(), Path::new(&path))
}

#[tauri::command(async)]
pub fn read_text_file(
    fs: State<'_, FileSystemState>,
    path: String,
) -> Result<FileContent, AppError> {
    file_use_cases::read_text_file(fs.0.as_ref(), Path::new(&path))
}

#[tauri::command(async)]
pub fn write_text_file(
    fs: State<'_, FileSystemState>,
    path: String,
    text: String,
    line_ending: LineEnding,
) -> Result<(), AppError> {
    file_use_cases::write_text_file(fs.0.as_ref(), Path::new(&path), &text, line_ending)
}

#[tauri::command(async)]
pub fn git_status(git: State<'_, GitState>, root: String) -> Result<GitStatus, AppError> {
    git_use_cases::status(git.0.as_ref(), Path::new(&root))
}

#[tauri::command(async)]
pub fn git_repositories(git: State<'_, GitState>, root: String) -> Result<Vec<String>, AppError> {
    Ok(git
        .0
        .repositories(Path::new(&root))?
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect())
}

#[tauri::command(async)]
pub fn git_diff(
    git: State<'_, GitState>,
    root: String,
    path: String,
    staged: bool,
) -> Result<String, AppError> {
    git.0.diff(Path::new(&root), &path, staged)
}

#[tauri::command(async)]
pub fn git_stage(
    git: State<'_, GitState>,
    root: String,
    paths: Vec<String>,
) -> Result<GitStatus, AppError> {
    git_use_cases::stage(git.0.as_ref(), Path::new(&root), &paths)
}

#[tauri::command(async)]
pub fn git_unstage(
    git: State<'_, GitState>,
    root: String,
    paths: Vec<String>,
) -> Result<GitStatus, AppError> {
    git_use_cases::unstage(git.0.as_ref(), Path::new(&root), &paths)
}

#[tauri::command(async)]
pub fn terminal_shells(terminal: State<'_, TerminalState>) -> Vec<ShellProfile> {
    available_shells(terminal.locator.as_ref())
}

/// Start a shell and stream what it prints to `on_event` until it exits.
#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub fn terminal_open(
    app: AppHandle,
    terminal: State<'_, TerminalState>,
    id: u32,
    profile_id: String,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
) -> Result<(), AppError> {
    let profile = available_shells(terminal.locator.as_ref())
        .into_iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| {
            AppError::new(
                ErrorKind::NotFound,
                format!("the shell \"{profile_id}\" is not installed"),
            )
        })?;

    let cwd = match cwd {
        Some(dir) => PathBuf::from(dir),
        None => terminal
            .locator
            .env("USERPROFILE")
            .map(PathBuf::from)
            .ok_or_else(|| {
                AppError::new(
                    ErrorKind::NotFound,
                    "the home folder could not be determined",
                )
            })?,
    };

    let events: EventSink = Box::new(move |event| {
        let exited = matches!(event, TerminalEvent::Exit { .. });
        // The frontend may already be gone; there is nobody left to tell.
        let _ = on_event.send(event);
        if exited {
            // A shell that ended by itself is forgotten here; the frontend only closes live ones.
            app.state::<TerminalState>().sessions.close(id);
        }
    });

    terminal.sessions.open(
        terminal.spawner.as_ref(),
        id,
        &profile,
        &cwd,
        TerminalSize { cols, rows },
        events,
    )
}

#[tauri::command(async)]
pub fn terminal_write(
    terminal: State<'_, TerminalState>,
    id: u32,
    data: String,
) -> Result<(), AppError> {
    terminal.sessions.write(id, &data)
}

#[tauri::command(async)]
pub fn terminal_resize(
    terminal: State<'_, TerminalState>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    terminal.sessions.resize(id, TerminalSize { cols, rows })
}

#[tauri::command(async)]
pub fn terminal_acknowledge(terminal: State<'_, TerminalState>, id: u32, seq: u64) {
    terminal.sessions.acknowledge(id, seq);
}

#[tauri::command(async)]
pub fn terminal_close(terminal: State<'_, TerminalState>, id: u32) {
    terminal.sessions.close(id);
}

/// End every session. A freshly loaded page calls this: whatever is still
/// running belongs to a page that no longer exists.
#[tauri::command(async)]
pub fn terminal_close_all(terminal: State<'_, TerminalState>) {
    terminal.sessions.close_all();
}
