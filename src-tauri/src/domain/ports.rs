use std::path::Path;

use super::error::AppError;
use super::fs::DirEntry;

/// Raw storage access the use cases need. Implemented by the infrastructure
/// layer; a fake can stand in for it in tests.
pub trait FileSystem {
    /// The direct children of `path`, in no particular order.
    fn read_dir(&self, path: &Path) -> Result<Vec<DirEntry>, AppError>;
    fn file_size(&self, path: &Path) -> Result<u64, AppError>;
    fn read(&self, path: &Path) -> Result<Vec<u8>, AppError>;
    fn write(&self, path: &Path, bytes: &[u8]) -> Result<(), AppError>;
}
