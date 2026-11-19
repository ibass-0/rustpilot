use std::path::Path;

use crate::domain::error::AppError;
use crate::domain::fs::DirEntry;
use crate::domain::ports::FileSystem;

/// `FileSystem` backed by `std::fs`.
pub struct LocalFileSystem;

impl FileSystem for LocalFileSystem {
    fn read_dir(&self, path: &Path) -> Result<Vec<DirEntry>, AppError> {
        let mut entries = Vec::new();
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            // `metadata` follows symlinks/junctions, so a link to a directory shows
            // as a directory; a broken link falls back to `file_type`.
            let is_dir = match std::fs::metadata(entry.path()) {
                Ok(meta) => meta.is_dir(),
                Err(_) => entry.file_type().map(|t| t.is_dir()).unwrap_or(false),
            };
            entries.push(DirEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: entry.path().to_string_lossy().into_owned(),
                is_dir,
            });
        }
        Ok(entries)
    }

    fn file_size(&self, path: &Path) -> Result<u64, AppError> {
        Ok(std::fs::metadata(path)?.len())
    }

    fn read(&self, path: &Path) -> Result<Vec<u8>, AppError> {
        Ok(std::fs::read(path)?)
    }

    fn write(&self, path: &Path, bytes: &[u8]) -> Result<(), AppError> {
        Ok(std::fs::write(path, bytes)?)
    }
}
