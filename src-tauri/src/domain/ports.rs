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

/// Runs read-only Git commands. `None` means the path is not a repository.
pub trait GitRepository: Send + Sync {
    /// Every repository at or below `root`, plus the one that contains `root` when `root` is not itself one.
    fn repositories(&self, root: &Path) -> Result<Vec<super::git::RepositoryInfo>, AppError>;
    /// The output of `git --version`.
    fn version(&self) -> Result<String, AppError>;
    fn status(&self, root: &Path) -> Result<Option<Vec<u8>>, AppError>;
    fn diff(&self, root: &Path, path: &str, staged: bool) -> Result<String, AppError>;
    fn stage(&self, root: &Path, paths: &[String]) -> Result<(), AppError>;
    fn unstage(&self, root: &Path, paths: &[String]) -> Result<(), AppError>;
    /// Commit what is staged. The message is passed through a file, never as an argument.
    fn commit(&self, root: &Path, message: &str, amend: bool, sign_off: bool) -> Result<(), AppError>;
    /// The full message of the last commit, or `None` when there is no commit yet.
    fn last_message(&self, root: &Path) -> Result<Option<String>, AppError>;
    /// Restore `tracked` paths in the working tree from the index and delete `untracked` ones.
    fn discard(&self, root: &Path, tracked: &[String], untracked: &[String]) -> Result<(), AppError>;
    /// Apply a patch (read from stdin) to the index (cached) or the working tree, optionally reversed.
    fn apply_patch(&self, root: &Path, patch: &str, cached: bool, reverse: bool) -> Result<(), AppError>;
    /// The content of a revision path such as HEAD:path or :path (the index), or None when it does not exist.
    fn show(&self, root: &Path, spec: &str) -> Result<Option<Vec<u8>>, AppError>;
    /// The working-tree file at the path, or None when it is gone.
    fn working_file(&self, root: &Path, path: &str) -> Result<Option<Vec<u8>>, AppError>;
    /// Run a read-only Git command with exactly these arguments and give its output. The caller builds
    /// the arguments and must make sure no user text can become an option.
    fn query(&self, root: &Path, args: &[String]) -> Result<Vec<u8>, AppError>;
    fn stage_all(&self, root: &Path) -> Result<(), AppError>;
    fn unstage_all(&self, root: &Path) -> Result<(), AppError>;
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

/// Opens live connections to a data source.
#[async_trait::async_trait]
pub trait DataSourceDriver: Send + Sync {
    /// Fails within 10 seconds.
    async fn connect(
        &self,
        config: &super::data_source::DataSourceConfig,
        password: Option<&super::data_source::Secret>,
    ) -> Result<Box<dyn DataSourceConnection>, AppError>;
}

/// One live connection. Dropping a pending call must stop its work, and
/// `interrupt` must stop work already running inside the engine.
#[async_trait::async_trait]
pub trait DataSourceConnection: Send + Sync {
    async fn children(&self, path: &[String]) -> Result<Vec<super::data_source::DataNode>, AppError>;
    async fn execute(&self, sql: &str) -> Result<super::sql::SqlResult, AppError>;
    /// Ask the engine to abandon the statement it is running. Safe from any thread.
    fn interrupt(&self) {}
    async fn close(&self);
}

/// Keeps passwords outside the app files, in the operating system credential store.
pub trait SecretStore: Send + Sync {
    fn get(&self, id: &str) -> Result<Option<super::data_source::Secret>, AppError>;
    fn set(&self, id: &str, secret: &super::data_source::Secret) -> Result<(), AppError>;
    /// Deleting an entry that does not exist succeeds.
    fn delete(&self, id: &str) -> Result<(), AppError>;
}
