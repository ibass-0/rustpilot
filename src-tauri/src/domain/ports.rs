use std::path::{Path, PathBuf};

use super::error::AppError;
use super::fs::DirEntry;
use super::terminal::{ShellProfile, TerminalEvent, TerminalSize};

/// Raw storage access the use cases need. Implemented by the infrastructure
/// layer; a fake can stand in for it in tests.
pub trait FileSystem {
    /// The direct children of `path`, in no particular order.
    fn read_dir(&self, path: &Path) -> Result<Vec<DirEntry>, AppError>;
    fn file_size(&self, path: &Path) -> Result<u64, AppError>;
    fn read(&self, path: &Path) -> Result<Vec<u8>, AppError>;
    fn write(&self, path: &Path, bytes: &[u8]) -> Result<(), AppError>;
}

/// Answers "is this program installed, and where?".
pub trait ProgramLocator {
    /// The full path of `exe` (an exact file name such as `cmd.exe`) if a `PATH` folder contains it.
    fn find_in_path(&self, exe: &str) -> Option<PathBuf>;
    fn exists(&self, path: &Path) -> bool;
    fn env(&self, name: &str) -> Option<String>;
}

/// Receives everything a terminal session reports. Called from background threads.
pub type EventSink = Box<dyn Fn(TerminalEvent) + Send + Sync>;

/// A shell running inside a pseudo terminal.
pub trait PtySession: Send {
    fn write(&mut self, data: &[u8]) -> Result<(), AppError>;
    fn resize(&mut self, size: TerminalSize) -> Result<(), AppError>;
    /// The screen has drawn every chunk up to and including `seq`.
    fn acknowledge(&mut self, seq: u64);
    /// End the shell and release the terminal. Safe to call more than once.
    fn kill(&mut self);
}

/// Starts shells inside pseudo terminals.
pub trait PtySpawner: Send + Sync {
    fn spawn(
        &self,
        profile: &ShellProfile,
        cwd: &Path,
        size: TerminalSize,
        events: EventSink,
    ) -> Result<Box<dyn PtySession>, AppError>;
}
