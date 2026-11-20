//! Layers, innermost first: `domain` -> `application` -> `infrastructure` /
//! `presentation`. Dependencies only ever point inwards; this file is the
//! composition root that wires the adapters in.

pub mod application;
pub mod domain;
pub mod infrastructure;
mod presentation;

use application::terminal::TerminalSessions;
use infrastructure::local_fs::LocalFileSystem;
use infrastructure::program_locator::SystemProgramLocator;
use infrastructure::pty::PortablePtySpawner;
use presentation::commands::{FileSystemState, TerminalState};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(FileSystemState(Box::new(LocalFileSystem)))
        .manage(TerminalState {
            sessions: TerminalSessions::new(),
            spawner: Box::new(PortablePtySpawner),
            locator: Box::new(SystemProgramLocator),
        })
        .invoke_handler(tauri::generate_handler![
            presentation::commands::list_dir,
            presentation::commands::read_text_file,
            presentation::commands::write_text_file,
            presentation::commands::terminal_shells,
            presentation::commands::terminal_open,
            presentation::commands::terminal_write,
            presentation::commands::terminal_resize,
            presentation::commands::terminal_acknowledge,
            presentation::commands::terminal_close,
            presentation::commands::terminal_close_all,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        // Shells must not outlive the window that showed them.
        if let tauri::RunEvent::Exit = event {
            handle.state::<TerminalState>().sessions.close_all();
        }
    });
}
