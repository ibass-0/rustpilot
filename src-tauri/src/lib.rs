//! Layers, innermost first: `domain` -> `application` -> `infrastructure` /
//! `presentation`. Dependencies only ever point inwards; this file is the
//! composition root that wires the adapters in.

pub mod application;
pub mod domain;
pub mod infrastructure;
mod presentation;

use application::terminal::TerminalSessions;
use infrastructure::local_fs::LocalFileSystem;
use infrastructure::git_cli::GitCli;
use infrastructure::program_locator::SystemProgramLocator;
use infrastructure::pty::PortablePtySpawner;
use infrastructure::keyring_secrets::KeyringSecretStore;
use infrastructure::sqlx_driver::SqlxDriver;
use application::data_source::DataSourceSessions;
use presentation::commands::{DataSourceState, FileSystemState, GitState, GitWatchState, TerminalState};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(FileSystemState(Box::new(LocalFileSystem)))
        .manage(GitState(Box::new(GitCli)))
        .manage(GitWatchState::default())
        .manage(TerminalState {
            sessions: TerminalSessions::new(),
            spawner: Box::new(PortablePtySpawner),
            locator: Box::new(SystemProgramLocator),
        })
        .manage(DataSourceState { sessions: DataSourceSessions::new(), driver: Box::new(SqlxDriver), secrets: Box::new(KeyringSecretStore) })
        .invoke_handler(tauri::generate_handler![
            presentation::commands::list_dir,
            presentation::commands::read_text_file,
            presentation::commands::write_text_file,
            presentation::commands::git_status,
            presentation::commands::git_repositories,
            presentation::commands::git_version,
            presentation::commands::git_watch,
            presentation::commands::git_unwatch,
            presentation::commands::git_commit,
            presentation::commands::git_log,
            presentation::commands::git_commit_details,
            presentation::commands::git_commit_file_diff,
            presentation::commands::git_compare_files,
            presentation::commands::git_compare_file_diff,
            presentation::commands::git_refs,
            presentation::commands::git_apply_hunk,
            presentation::commands::git_file_versions,
            presentation::commands::git_last_message,
            presentation::commands::git_discard,
            presentation::commands::git_stage_all,
            presentation::commands::git_unstage_all,
            presentation::commands::git_diff,
            presentation::commands::git_stage,
            presentation::commands::git_unstage,
            presentation::commands::terminal_shells,
            presentation::commands::terminal_open,
            presentation::commands::terminal_write,
            presentation::commands::terminal_resize,
            presentation::commands::terminal_acknowledge,
            presentation::commands::terminal_close,
            presentation::commands::terminal_close_all,
            presentation::commands::ds_test,
            presentation::commands::ds_connect,
            presentation::commands::ds_save_secret,
            presentation::commands::ds_forget_secret,
            presentation::commands::ds_disconnect,
            presentation::commands::ds_children,
            presentation::commands::ds_console_path,
            presentation::commands::sql_execute,
            presentation::commands::sql_cancel,
            presentation::commands::docker_info,
            presentation::commands::docker_containers,
            presentation::commands::docker_images,
            presentation::commands::docker_volumes,
            presentation::commands::docker_networks,
            presentation::commands::docker_action,
            presentation::commands::docker_logs,
            presentation::commands::docker_exec,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        // Shells must not outlive the window that showed them.
        if let tauri::RunEvent::Exit = event {
            handle.state::<TerminalState>().sessions.close_all();
            tauri::async_runtime::block_on(handle.state::<DataSourceState>().sessions.close_all());
        }
    });
}
