//! Thin Tauri wrappers over the use cases. `async` keeps I/O off the main
//! thread so the window never freezes.

use std::path::{Path, PathBuf};

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use std::process::Command;

use crate::application::git_log::{self as git_log_cases, CommitDetails, CommitFile, LogPage, LogRequest, RefInfo};
use crate::application::data_source::{DataSourceSessions, forget_secret, save_secret};
use crate::application::terminal::{TerminalSessions, available_shells};
use crate::application::{fs as file_use_cases, git as git_use_cases};
use crate::domain::data_source::{DataNode, DataSourceConfig, Secret, is_safe_id};
use crate::domain::error::{AppError, ErrorKind};
use crate::domain::fs::{DirEntry, FileContent, LineEnding};
use crate::domain::git::{GitStatus, RepositoryInfo};
use crate::domain::ports::{DataSourceDriver, EventSink, FileSystem, GitRepository, ProgramLocator, PtySpawner, SecretStore};
use crate::domain::sql::SqlResult;
use crate::domain::terminal::{ShellProfile, TerminalEvent, TerminalSize};

/// The file system the commands work against, chosen by the composition root
/// in `lib.rs` so this layer never names a concrete adapter.
pub struct FileSystemState(pub Box<dyn FileSystem + Send + Sync>);

pub struct GitState(pub Box<dyn GitRepository>);

fn docker_command(args: &[&str]) -> Result<String, AppError> {
    let output = Command::new("docker").args(args).output()?;
    if !output.status.success() { return Err(AppError::new(ErrorKind::Connection, String::from_utf8_lossy(&output.stderr).trim())); }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command(async)]
pub fn docker_info() -> Result<serde_json::Value, AppError> {
    let raw = docker_command(&["info", "--format", "{{json .}}"])?;
    let value: serde_json::Value = serde_json::from_str(raw.trim()).map_err(|e| AppError::new(ErrorKind::Io, e.to_string()))?;
    Ok(serde_json::json!({ "version": value["ServerVersion"], "server": value["Name"], "containers": value["Containers"], "images": value["Images"] }))
}

#[tauri::command(async)]
pub fn docker_containers(all: bool) -> Result<serde_json::Value, AppError> { let raw = docker_command(if all { &["ps", "-a", "--format", "{{json .}}"] } else { &["ps", "--format", "{{json .}}"] })?; Ok(serde_json::Value::Array(raw.lines().filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok()).map(|v| { let labels = v["Labels"].as_str().unwrap_or(""); let value = |key: &str| labels.split(',').find_map(|item| item.strip_prefix(&format!("{key}="))).map(str::to_string); serde_json::json!({"id":v["ID"],"name":v["Names"],"image":v["Image"],"state":v["State"],"status":v["Status"],"ports":v["Ports"],"project":value("com.docker.compose.project"),"service":value("com.docker.compose.service")}) }).collect())) }

#[tauri::command(async)]
pub fn docker_images() -> Result<serde_json::Value, AppError> { let raw = docker_command(&["images", "--format", "{{json .}}"])?; Ok(serde_json::Value::Array(raw.lines().filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok()).map(|v| serde_json::json!({"id":v["ID"],"repository":v["Repository"],"tag":v["Tag"],"size":v["Size"],"created":v["CreatedSince"]})).collect())) }
#[tauri::command(async)]
pub fn docker_volumes() -> Result<serde_json::Value, AppError> { let raw = docker_command(&["volume", "ls", "--format", "{{json .}}"])?; Ok(serde_json::Value::Array(raw.lines().filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok()).map(|v| serde_json::json!({"id":v["Name"],"name":v["Name"],"driver":v["Driver"]})).collect())) }
#[tauri::command(async)]
pub fn docker_networks() -> Result<serde_json::Value, AppError> { let raw = docker_command(&["network", "ls", "--format", "{{json .}}"])?; Ok(serde_json::Value::Array(raw.lines().filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok()).map(|v| serde_json::json!({"id":v["ID"],"name":v["Name"],"driver":v["Driver"]})).collect())) }

#[tauri::command(async)]
pub fn docker_action(action: String, id: String) -> Result<(), AppError> { if !["start", "stop", "restart"].contains(&action.as_str()) { return Err(AppError::new(ErrorKind::InvalidConfig, "unsupported Docker action")); } docker_command(&[&action, &id]).map(|_| ()) }

#[tauri::command(async)]
pub fn docker_logs(id: String, tail: u32) -> Result<String, AppError> { docker_command(&["logs", "--tail", &tail.to_string(), &id]) }
#[tauri::command(async)]
pub fn docker_exec(id: String, command: String) -> Result<String, AppError> { docker_command(&["exec", &id, "sh", "-lc", &command]) }

/// The repositories being watched, by root path. Replacing or removing one stops its watcher.
#[derive(Default)]
pub struct GitWatchState(pub std::sync::Mutex<std::collections::HashMap<String, crate::infrastructure::git_watch::GitWatchHandle>>);

fn watch_key(root: &str) -> String {
    root.replace('\\', "/").trim_end_matches('/').to_lowercase()
}

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
pub fn git_repositories(git: State<'_, GitState>, root: String) -> Result<Vec<RepositoryInfo>, AppError> {
    git.0.repositories(Path::new(&root))
}

/// The installed Git version, or an error saying Git is missing or too old.
#[tauri::command(async)]
pub fn git_version(git: State<'_, GitState>) -> Result<String, AppError> {
    let text = git.0.version()?;
    git_use_cases::check_git_version(git_use_cases::parse_git_version(&text))?;
    Ok(text)
}

/// Tell the frontend (once per burst, debounced) when the Git state of `root` changed.
#[tauri::command(async)]
pub fn git_watch(watching: State<'_, GitWatchState>, root: String, on_change: Channel<()>) -> Result<(), AppError> {
    let handle = crate::infrastructure::git_watch::watch(
        Path::new(&root),
        Box::new(move || {
            let _ = on_change.send(());
        }),
    )?;
    watching.0.lock().unwrap_or_else(|p| p.into_inner()).insert(watch_key(&root), handle);
    Ok(())
}

#[tauri::command(async)]
pub fn git_unwatch(watching: State<'_, GitWatchState>, root: String) {
    watching.0.lock().unwrap_or_else(|p| p.into_inner()).remove(&watch_key(&root));
}

#[tauri::command(async)]
pub fn git_commit(
    git: State<'_, GitState>,
    root: String,
    message: String,
    amend: bool,
    sign_off: bool,
) -> Result<GitStatus, AppError> {
    git_use_cases::commit(git.0.as_ref(), Path::new(&root), &message, amend, sign_off)
}

#[tauri::command(async)]
pub fn git_last_message(git: State<'_, GitState>, root: String) -> Result<Option<String>, AppError> {
    git_use_cases::last_message(git.0.as_ref(), Path::new(&root))
}

/// Throws away working-tree changes: `tracked` files are restored, `untracked` ones deleted.
#[tauri::command(async)]
pub fn git_discard(
    git: State<'_, GitState>,
    root: String,
    tracked: Vec<String>,
    untracked: Vec<String>,
) -> Result<GitStatus, AppError> {
    git_use_cases::discard(git.0.as_ref(), Path::new(&root), &tracked, &untracked)
}

#[tauri::command(async)]
pub fn git_stage_all(git: State<'_, GitState>, root: String) -> Result<GitStatus, AppError> {
    git_use_cases::stage_all(git.0.as_ref(), Path::new(&root))
}

#[tauri::command(async)]
pub fn git_unstage_all(git: State<'_, GitState>, root: String) -> Result<GitStatus, AppError> {
    git_use_cases::unstage_all(git.0.as_ref(), Path::new(&root))
}

/// The action is stage, unstage or discard.
#[tauri::command(async)]
pub fn git_apply_hunk(git: State<'_, GitState>, root: String, patch: String, action: String) -> Result<GitStatus, AppError> {
    let action = match action.as_str() {
        "stage" => git_use_cases::HunkAction::Stage,
        "unstage" => git_use_cases::HunkAction::Unstage,
        "discard" => git_use_cases::HunkAction::Discard,
        other => return Err(AppError::new(ErrorKind::Io, format!("Unknown hunk action {other}"))),
    };
    git_use_cases::apply_hunk(git.0.as_ref(), Path::new(&root), &patch, action)
}

#[tauri::command(async)]
pub fn git_file_versions(
    git: State<'_, GitState>,
    root: String,
    path: String,
    staged: bool,
) -> Result<crate::domain::git::FileVersions, AppError> {
    git_use_cases::file_versions(git.0.as_ref(), Path::new(&root), &path, staged)
}

#[tauri::command(async)]
pub fn git_log(git: State<'_, GitState>, root: String, request: LogRequest) -> Result<LogPage, AppError> {
    git_log_cases::log(git.0.as_ref(), Path::new(&root), &request)
}

#[tauri::command(async)]
pub fn git_commit_details(git: State<'_, GitState>, root: String, revision: String) -> Result<CommitDetails, AppError> {
    git_log_cases::commit_details(git.0.as_ref(), Path::new(&root), &revision)
}

#[tauri::command(async)]
pub fn git_commit_file_diff(git: State<'_, GitState>, root: String, revision: String, path: String) -> Result<String, AppError> {
    git_log_cases::commit_file_diff(git.0.as_ref(), Path::new(&root), &revision, &path)
}

#[tauri::command(async)]
pub fn git_compare_files(git: State<'_, GitState>, root: String, a: String, b: String) -> Result<Vec<CommitFile>, AppError> {
    git_log_cases::compare_files(git.0.as_ref(), Path::new(&root), &a, &b)
}

#[tauri::command(async)]
pub fn git_compare_file_diff(
    git: State<'_, GitState>,
    root: String,
    a: String,
    b: String,
    path: String,
) -> Result<String, AppError> {
    git_log_cases::compare_file_diff(git.0.as_ref(), Path::new(&root), &a, &b, &path)
}

#[tauri::command(async)]
pub fn git_refs(git: State<'_, GitState>, root: String) -> Result<Vec<RefInfo>, AppError> {
    git_log_cases::list_refs(git.0.as_ref(), Path::new(&root))
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

/// Everything the data source commands need, wired in `lib.rs`.
pub struct DataSourceState {
    pub sessions: DataSourceSessions,
    pub driver: Box<dyn DataSourceDriver>,
    pub secrets: Box<dyn SecretStore>,
}

#[tauri::command]
pub async fn ds_test(
    state: State<'_, DataSourceState>,
    config: DataSourceConfig,
    password: Option<String>,
) -> Result<(), AppError> {
    let password = password.map(Secret::new);
    state.sessions.test(state.driver.as_ref(), state.secrets.as_ref(), &config, password).await
}

#[tauri::command]
pub async fn ds_connect(
    state: State<'_, DataSourceState>,
    config: DataSourceConfig,
    password: Option<String>,
) -> Result<(), AppError> {
    let password = password.map(Secret::new);
    state.sessions.connect(state.driver.as_ref(), state.secrets.as_ref(), config, password).await
}

#[tauri::command(async)]
pub fn ds_save_secret(state: State<'_, DataSourceState>, id: String, password: String) -> Result<(), AppError> {
    save_secret(state.secrets.as_ref(), &id, Secret::new(password))
}

#[tauri::command(async)]
pub fn ds_forget_secret(state: State<'_, DataSourceState>, id: String) -> Result<(), AppError> {
    forget_secret(state.secrets.as_ref(), &id)
}

#[tauri::command]
pub async fn ds_disconnect(state: State<'_, DataSourceState>, id: String) -> Result<(), AppError> {
    state.sessions.disconnect(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn ds_children(
    state: State<'_, DataSourceState>,
    id: String,
    path: Vec<String>,
) -> Result<Vec<DataNode>, AppError> {
    state.sessions.children(&id, &path).await
}

/// The `.sql` console file of a data source, created empty on first use.
#[tauri::command(async)]
pub fn ds_console_path(app: AppHandle, id: String) -> Result<String, AppError> {
    if !is_safe_id(&id) {
        return Err(AppError::new(ErrorKind::InvalidConfig, "The data source id is not valid."));
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::new(ErrorKind::Io, e.to_string()))?
        .join("consoles");
    std::fs::create_dir_all(&dir)?;
    let file = dir.join(format!("{id}.sql"));
    if !file.exists() {
        std::fs::write(&file, "")?;
    }
    Ok(file.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn sql_execute(
    state: State<'_, DataSourceState>,
    id: String,
    execution_id: u64,
    sql: String,
) -> Result<SqlResult, AppError> {
    state.sessions.execute(&id, execution_id, &sql).await
}

#[tauri::command]
pub fn sql_cancel(state: State<'_, DataSourceState>, execution_id: u64) {
    state.sessions.cancel(execution_id);
}
