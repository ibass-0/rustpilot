//! Thin Tauri wrappers over the use cases. `async` keeps I/O off the main
//! thread so the window never freezes.

use std::path::Path;

use crate::application::fs as use_cases;
use crate::domain::error::AppError;
use crate::domain::fs::{DirEntry, FileContent, LineEnding};
use crate::infrastructure::local_fs::LocalFileSystem;

#[tauri::command(async)]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, AppError> {
    use_cases::list_dir(&LocalFileSystem, Path::new(&path))
}

#[tauri::command(async)]
pub fn read_text_file(path: String) -> Result<FileContent, AppError> {
    use_cases::read_text_file(&LocalFileSystem, Path::new(&path))
}

#[tauri::command(async)]
pub fn write_text_file(path: String, text: String, line_ending: LineEnding) -> Result<(), AppError> {
    use_cases::write_text_file(&LocalFileSystem, Path::new(&path), &text, line_ending)
}
