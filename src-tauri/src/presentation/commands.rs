//! Thin Tauri wrappers over the use cases. `async` keeps I/O off the main
//! thread so the window never freezes.

use std::path::Path;

use tauri::State;

use crate::application::fs as use_cases;
use crate::domain::error::AppError;
use crate::domain::fs::{DirEntry, FileContent, LineEnding};
use crate::domain::ports::FileSystem;

/// The file system the commands work against, chosen by the composition root
/// in `lib.rs` so this layer never names a concrete adapter.
pub struct FileSystemState(pub Box<dyn FileSystem + Send + Sync>);

#[tauri::command(async)]
pub fn list_dir(fs: State<'_, FileSystemState>, path: String) -> Result<Vec<DirEntry>, AppError> {
    use_cases::list_dir(fs.0.as_ref(), Path::new(&path))
}

#[tauri::command(async)]
pub fn read_text_file(fs: State<'_, FileSystemState>, path: String) -> Result<FileContent, AppError> {
    use_cases::read_text_file(fs.0.as_ref(), Path::new(&path))
}

#[tauri::command(async)]
pub fn write_text_file(
    fs: State<'_, FileSystemState>,
    path: String,
    text: String,
    line_ending: LineEnding,
) -> Result<(), AppError> {
    use_cases::write_text_file(fs.0.as_ref(), Path::new(&path), &text, line_ending)
}
