use std::path::Path;
use std::process::Command;

use crate::domain::error::{AppError, ErrorKind};
use crate::domain::ports::GitRepository;

pub struct GitCli;

impl GitCli {
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
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }

    fn stage(&self, root: &Path, paths: &[String]) -> Result<(), AppError> {
        Self::run(root, "stage", &["add"], paths)
    }

    fn unstage(&self, root: &Path, paths: &[String]) -> Result<(), AppError> {
        Self::run(root, "unstage", &["reset", "--quiet"], paths)
    }
}
