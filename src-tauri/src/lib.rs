//! Layers, innermost first: `domain` -> `application` -> `infrastructure` /
//! `presentation`. Dependencies only ever point inwards.

pub mod application;
pub mod domain;
pub mod infrastructure;
mod presentation;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            presentation::commands::list_dir,
            presentation::commands::read_text_file,
            presentation::commands::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
