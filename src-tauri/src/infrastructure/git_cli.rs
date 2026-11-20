use std::path::Path;
use std::process::Command;

use crate::domain::error::{AppError, ErrorKind};
use crate::domain::ports::GitRepository;

pub struct GitCli;

impl GitCli {
    fn discover(path: &Path, found: &mut Vec<std::path::PathBuf>) -> Result<(), AppError> {
        if path.join(".git").exists() {
            found.push(path.to_path_buf());
        }
        for entry in std::fs::read_dir(path)?.flatten() {
            let child = entry.path();
            if !child.is_dir()
                || matches!(
                    entry.file_name().to_string_lossy().as_ref(),
                    ".git" | "node_modules" | "target"
                )
            {
                continue;
            }
            Self::discover(&child, found)?;
        }
        Ok(())
    }
    fn command(root: &Path) -> Command {
        let mut command = Command::new("git");
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
        AppError::new(
            ErrorKind::NotFound,
            "Git is not installed or is not available on PATH",
        )
    } else {
        AppError::from(err)
    }
}

impl GitRepository for GitCli {
    fn repositories(&self, root: &Path) -> Result<Vec<std::path::PathBuf>, AppError> {
        let mut found = Vec::new();
        Self::discover(root, &mut found)?;
        found.sort();
        Ok(found)
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
