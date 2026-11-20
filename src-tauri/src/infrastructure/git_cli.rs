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

    fn stage(&self, root: &Path, paths: &[String]) -> Result<(), AppError> {
        Self::run(root, "stage", &["add"], paths)
    }

    fn unstage(&self, root: &Path, paths: &[String]) -> Result<(), AppError> {
        Self::run(root, "unstage", &["reset", "--quiet"], paths)
    }
}
