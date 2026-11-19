//! Thin Tauri wrappers over `core`. `async` keeps I/O off the main thread so
//! the window never freezes.

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
