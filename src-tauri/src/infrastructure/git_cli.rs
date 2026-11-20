use std::path::Path;
use std::process::Command;

use crate::application::git::kind_from_git_file;
use crate::domain::error::{AppError, ErrorKind};
use crate::domain::git::{RepositoryInfo, RepositoryKind};
use crate::domain::ports::GitRepository;

pub struct GitCli;

/// Folders that hold dependencies or build output, never repositories of their own.
const SKIPPED_FOLDERS: &[&str] = &[".git", "node_modules", "target", "dist", "build", ".venv", ".next"];
const MAX_DEPTH: usize = 8;

fn repository_kind(path: &Path) -> Option<RepositoryKind> {
    let dot_git = path.join(".git");
    if dot_git.is_dir() {
        Some(RepositoryKind::Repository)
    } else if dot_git.is_file() {
        Some(kind_from_git_file(&std::fs::read_to_string(dot_git).unwrap_or_default()))
    } else {
        None
    }
}

impl GitCli {
    fn discover(path: &Path, depth: usize, found: &mut Vec<RepositoryInfo>) -> Result<(), AppError> {
        if let Some(kind) = repository_kind(path) {
            found.push(RepositoryInfo { root: path.to_string_lossy().into_owned(), kind });
        }
        if depth >= MAX_DEPTH {
            return Ok(());
        }
        for entry in std::fs::read_dir(path)?.flatten() {
            let Ok(file_type) = entry.file_type() else { continue };
            // Links are skipped so a loop cannot trap the walk.
            if !file_type.is_dir() || file_type.is_symlink() {
                continue;
            }
            if SKIPPED_FOLDERS.contains(&entry.file_name().to_string_lossy().as_ref()) {
                continue;
            }
            Self::discover(&entry.path(), depth + 1, found)?;
        }
        Ok(())
    }

    fn command(root: &Path) -> Command {
        let mut command = Command::new("git");
        // Reading never takes the index lock, and a missing login fails at once instead of waiting for input.
        command.env("GIT_OPTIONAL_LOCKS", "0").env("GIT_TERMINAL_PROMPT", "0");
        command
            .arg("--no-optional-locks")
            .arg("-c")
            .arg("core.quotepath=false")
            .arg("-C")
            .arg(root);
        command
    }

    fn run(root: &Path, operation: &str, args: &[&str], paths: &[String]) -> Result<(), AppError> {
        let output = Self::command(root)
            .args(args)
            .arg("--")
            .args(paths)
            .output()
            .map_err(map_start_error)?;
        if output.status.success() {
            return Ok(());
        }
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(AppError::new(
            ErrorKind::Io,
            if message.is_empty() {
                format!("Git {operation} failed")
            } else {
                message
            },
        ))
    }
}

fn map_start_error(err: std::io::Error) -> AppError {
    if err.kind() == std::io::ErrorKind::NotFound {
        AppError::new(ErrorKind::GitMissing, "Git was not found. Install Git for Windows and restart RustPilot.")
    } else {
        AppError::from(err)
    }
}

impl GitRepository for GitCli {
    fn repositories(&self, root: &Path) -> Result<Vec<RepositoryInfo>, AppError> {
        let mut found = Vec::new();
        Self::discover(root, 0, &mut found)?;
        if repository_kind(root).is_none() {
            // The project may sit inside a bigger repository.
            if let Some(parent) = root.ancestors().skip(1).find(|p| repository_kind(p).is_some()) {
                let kind = repository_kind(parent).unwrap_or(RepositoryKind::Repository);
                found.push(RepositoryInfo { root: parent.to_string_lossy().into_owned(), kind });
            }
        }
        found.sort_by(|a, b| a.root.cmp(&b.root));
        Ok(found)
    }

    fn version(&self) -> Result<String, AppError> {
        let output = Command::new("git").arg("--version").output().map_err(map_start_error)?;
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    fn status(&self, root: &Path) -> Result<Option<Vec<u8>>, AppError> {
        let output = Self::command(root)
            .args(["status", "--porcelain=v2", "-z", "--branch"])
            .output()
            .map_err(map_start_error)?;

        if output.status.success() {
            return Ok(Some(output.stdout));
        }
        if output.status.code() == Some(128) {
            return Ok(None);
        }

        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(AppError::new(
            ErrorKind::Io,
            if message.is_empty() {
                "Git status failed".to_string()
            } else {
                message
            },
        ))
    }

    fn diff(&self, root: &Path, path: &str, staged: bool) -> Result<String, AppError> {
        let output = Self::command(root)
            .args(if staged {
                vec!["diff", "--cached", "--no-ext-diff", "--no-color"]
            } else {
                vec!["diff", "--no-ext-diff", "--no-color"]
            })
            .arg("--")
            .arg(path)
            .output()
            .map_err(map_start_error)?;
        if !output.status.success() {
            let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(AppError::new(
                ErrorKind::Io,
                if message.is_empty() {
                    "Git diff failed"
                } else {
                    &message
                },
            ));
        }
        if output.stdout.is_empty() && !staged {
            let tracked = Self::command(root)
                .args(["ls-files", "--error-unmatch", "--"])
                .arg(path)
                .output()
                .map_err(map_start_error)?;
            if !tracked.status.success() {
                let null_device = if cfg!(windows) { "NUL" } else { "/dev/null" };
                let untracked = Self::command(root)
                    .args(["diff", "--no-index", "--no-ext-diff", "--no-color", "--"])
                    .arg(null_device)
                    .arg(path)
                    .output()
                    .map_err(map_start_error)?;
                // `--no-index` returns 1 when the files differ, which is the expected result.
                if untracked.status.success() || untracked.status.code() == Some(1) {
                    return Ok(String::from_utf8_lossy(&untracked.stdout).into_owned());
                }
            }
        }
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }

    fn commit(&self, root: &Path, message: &str, amend: bool, sign_off: bool) -> Result<(), AppError> {
        Self::commit_message(root, message, amend, sign_off)
    }

    fn last_message(&self, root: &Path) -> Result<Option<String>, AppError> {
        let output = Self::command(root).args(["log", "-1", "--format=%B"]).output().map_err(map_start_error)?;
        if !output.status.success() {
            // A repository without commits has no HEAD to read.
            return Ok(None);
        }
        let text = String::from_utf8_lossy(&output.stdout).trim_end().to_string();
        Ok(if text.is_empty() { None } else { Some(text) })
    }

    fn discard(&self, root: &Path, tracked: &[String], untracked: &[String]) -> Result<(), AppError> {
        if !tracked.is_empty() {
            Self::run_plain(root, &["restore", "--worktree"], tracked, "discard")?;
        }
        if !untracked.is_empty() {
            Self::run_plain(root, &["clean", "--force", "-d"], untracked, "discard")?;
        }
        Ok(())
    }

    fn stage_all(&self, root: &Path) -> Result<(), AppError> {
        Self::run_plain(root, &["add", "--all"], &[], "stage")
    }

    fn unstage_all(&self, root: &Path) -> Result<(), AppError> {
        // Before the first commit there is no HEAD to reset to; clearing the index is the same thing.
        let has_head = Self::command(root)
            .args(["rev-parse", "--verify", "--quiet", "HEAD"])
            .output()
            .map_err(map_start_error)?
            .status
            .success();
        if has_head {
            Self::run_plain(root, &["reset", "--quiet"], &[], "unstage")
        } else {
            Self::run_plain(root, &["rm", "--cached", "-r", "--quiet", "--", "."], &[], "unstage")
        }
    }

    fn stage(&self, root: &Path, paths: &[String]) -> Result<(), AppError> {
        Self::run(root, "stage", &["add"], paths)
    }

    fn unstage(&self, root: &Path, paths: &[String]) -> Result<(), AppError> {
        Self::run(root, "unstage", &["reset", "--quiet"], paths)
    }
}

// ---------- commit and friends ----------

/// stderr and stdout together: hooks print to stderr, but "nothing to commit" goes to stdout.
fn failure_text(output: &std::process::Output, fallback: &str) -> String {
    let mut text = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !out.is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&out);
    }
    if text.is_empty() { fallback.to_string() } else { text }
}

/// A message file that is removed again when it goes out of scope, whatever happens.
struct MessageFile(std::path::PathBuf);

impl MessageFile {
    fn create(message: &str) -> Result<Self, AppError> {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!("rustpilot-commit-{}-{nanos}.txt", std::process::id()));
        std::fs::write(&path, message)?;
        Ok(Self(path))
    }
}

impl Drop for MessageFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

impl GitCli {
    fn commit_message(root: &Path, message: &str, amend: bool, sign_off: bool) -> Result<(), AppError> {
        let file = MessageFile::create(message)?;
        let mut command = Self::command(root);
        // The message comes from a file, so Git never opens an editor; hooks still run.
        command.env("GIT_EDITOR", ":").arg("commit").arg("--cleanup=strip").arg("-F").arg(&file.0);
        if amend {
            command.arg("--amend");
        }
        if sign_off {
            command.arg("--signoff");
        }
        let output = command.output().map_err(map_start_error)?;
        if output.status.success() {
            Ok(())
        } else {
            Err(AppError::new(ErrorKind::Io, failure_text(&output, "Git commit failed")))
        }
    }

    fn run_plain(root: &Path, args: &[&str], paths: &[String], operation: &str) -> Result<(), AppError> {
        let mut command = Self::command(root);
        command.args(args);
        if !paths.is_empty() {
            command.arg("--").args(paths);
        }
        let output = command.output().map_err(map_start_error)?;
        if output.status.success() {
            Ok(())
        } else {
            Err(AppError::new(ErrorKind::Io, failure_text(&output, &format!("Git {operation} failed"))))
        }
    }
}
