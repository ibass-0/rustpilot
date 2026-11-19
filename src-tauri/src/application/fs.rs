//! File use cases, free of Tauri and of any concrete storage. Called by the
//! Tauri commands today and by agent tools later.

use std::path::Path;

use crate::domain::error::{AppError, ErrorKind};
use crate::domain::fs::{DirEntry, FileContent, LineEnding, MAX_FILE_BYTES};
use crate::domain::ports::FileSystem;

/// One level of a directory: directories first, then files, each sorted by
/// name case-insensitively.
pub fn list_dir(fs: &dyn FileSystem, path: &Path) -> Result<Vec<DirEntry>, AppError> {
    let mut entries = fs.read_dir(path)?;
    entries.sort_by_cached_key(|e| (!e.is_dir, e.name.to_lowercase()));
    Ok(entries)
}

/// Read a UTF-8 text file of at most `MAX_FILE_BYTES`, reporting its line ending.
pub fn read_text_file(fs: &dyn FileSystem, path: &Path) -> Result<FileContent, AppError> {
    let size = fs.file_size(path)?;
    if size > MAX_FILE_BYTES {
        return Err(AppError::new(
            ErrorKind::TooLarge,
            format!("file size {size} bytes exceeds the {MAX_FILE_BYTES} byte limit"),
        ));
    }
    let text = String::from_utf8(fs.read(path)?)
        .map_err(|_| AppError::new(ErrorKind::NotUtf8, "file is not UTF-8 text"))?;
    let line_ending = LineEnding::detect(&text);
    Ok(FileContent { text, line_ending })
}

/// Write `text` with every line break converted to `line_ending`.
pub fn write_text_file(
    fs: &dyn FileSystem,
    path: &Path,
    text: &str,
    line_ending: LineEnding,
) -> Result<(), AppError> {
    fs.write(path, line_ending.apply(text).as_bytes())
}
