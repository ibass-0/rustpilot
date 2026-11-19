//! Pembungkus Tauri tipis di atas `core`. `async` supaya I/O tidak berjalan
//! di thread utama dan membekukan jendela.

use std::path::Path;

use super::core::{self, DirEntry, FileContent, LineEnding};
use crate::error::AppError;

#[tauri::command(async)]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, AppError> {
    core::list_dir(Path::new(&path))
}

#[tauri::command(async)]
pub fn read_text_file(path: String) -> Result<FileContent, AppError> {
    core::read_text_file(Path::new(&path))
}

#[tauri::command(async)]
pub fn write_text_file(path: String, text: String, line_ending: LineEnding) -> Result<(), AppError> {
    core::write_text_file(Path::new(&path), &text, line_ending)
}
