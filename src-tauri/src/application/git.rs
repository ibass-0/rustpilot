use std::path::Path;

use crate::domain::error::{AppError, ErrorKind};
use crate::domain::git::{GitChange, GitChangeKind, GitStatus, RepositoryKind};
use crate::domain::ports::GitRepository;

pub fn status(repository: &dyn GitRepository, root: &Path) -> Result<GitStatus, AppError> {
    match repository.status(root)? {
        Some(output) => parse_status(&output),
        None => Ok(GitStatus::not_repository()),
    }
}

fn require_paths(paths: &[String]) -> Result<(), AppError> {
    if paths.is_empty() {
        Err(AppError::new(
            ErrorKind::Io,
            "At least one Git path is required",
        ))
    } else {
        Ok(())
    }
}

pub fn stage(
    repository: &dyn GitRepository,
    root: &Path,
    paths: &[String],
) -> Result<GitStatus, AppError> {
    require_paths(paths)?;
    repository.stage(root, paths)?;
    status(repository, root)
}

pub fn unstage(
    repository: &dyn GitRepository,
    root: &Path,
    paths: &[String],
) -> Result<GitStatus, AppError> {
    require_paths(paths)?;
    repository.unstage(root, paths)?;
    status(repository, root)
}

fn invalid(message: impl Into<String>) -> AppError {
    AppError::new(ErrorKind::Io, message)
}

fn change_kind(code: char) -> Option<GitChangeKind> {
    match code {
        'M' | 'T' => Some(GitChangeKind::Modified),
        'A' => Some(GitChangeKind::Added),
        'D' => Some(GitChangeKind::Deleted),
        'R' => Some(GitChangeKind::Renamed),
        'C' => Some(GitChangeKind::Copied),
        'U' => Some(GitChangeKind::Conflicted),
        _ => None,
    }
}

fn push_change(changes: &mut Vec<GitChange>, path: &str, original_path: Option<String>, xy: &str) {
    let mut codes = xy.chars();
    let index = codes.next().unwrap_or('.');
    let worktree = codes.next().unwrap_or('.');
    let conflicted = matches!(xy, "DD" | "AU" | "UD" | "UA" | "DU" | "AA" | "UU");

    if conflicted {
        changes.push(GitChange {
            path: path.to_string(),
            original_path,
            kind: GitChangeKind::Conflicted,
            staged: false,
        });
        return;
    }

    if let Some(kind) = change_kind(index) {
        changes.push(GitChange {
            path: path.to_string(),
            original_path: original_path.clone(),
            kind,
            staged: true,
        });
    }
    if let Some(kind) = change_kind(worktree) {
        changes.push(GitChange {
            path: path.to_string(),
            original_path,
            kind,
            staged: false,
        });
    }
}

/// Parse `git status --porcelain=v2 -z --branch` without losing unusual paths.
pub fn parse_status(output: &[u8]) -> Result<GitStatus, AppError> {
    let text =
        std::str::from_utf8(output).map_err(|_| invalid("Git returned non-UTF-8 status output"))?;
    let mut result = GitStatus {
        is_repository: true,
        branch: None,
        detached: false,
        upstream: None,
        ahead: 0,
        behind: 0,
        changes: Vec::new(),
    };
    let mut oid: Option<String> = None;
    let mut records = text
        .split('\0')
        .filter(|record| !record.is_empty())
        .peekable();

    while let Some(record) = records.next() {
        // Some Git versions keep branch headers newline-delimited even with -z.
        for line in record.split('\n').filter(|line| !line.is_empty()) {
            if let Some(value) = line.strip_prefix("# branch.head ") {
                result.detached = value == "(detached)";
                if !result.detached && value != "(unknown)" {
                    result.branch = Some(value.to_string());
                } else if result.detached {
                    result.branch = oid.as_ref().map(|value| value.chars().take(7).collect());
                }
            } else if let Some(value) = line.strip_prefix("# branch.oid ") {
                oid = (value != "(initial)").then(|| value.to_string());
            } else if let Some(value) = line.strip_prefix("# branch.upstream ") {
                result.upstream = Some(value.to_string());
            } else if let Some(value) = line.strip_prefix("# branch.ab ") {
                for part in value.split_whitespace() {
                    if let Some(ahead) = part.strip_prefix('+') {
                        result.ahead = ahead
                            .parse()
                            .map_err(|_| invalid("Git returned an invalid ahead count"))?;
                    } else if let Some(behind) = part.strip_prefix('-') {
                        result.behind = behind
                            .parse()
                            .map_err(|_| invalid("Git returned an invalid behind count"))?;
                    }
                }
            } else if let Some(path) = line.strip_prefix("? ") {
                result.changes.push(GitChange {
                    path: path.to_string(),
                    original_path: None,
                    kind: GitChangeKind::Untracked,
                    staged: false,
                });
            } else if line.starts_with("1 ") {
                let fields: Vec<_> = line.splitn(9, ' ').collect();
                if fields.len() != 9 {
                    return Err(invalid("Git returned a malformed ordinary change"));
                }
                push_change(&mut result.changes, fields[8], None, fields[1]);
            } else if line.starts_with("2 ") {
                let fields: Vec<_> = line.splitn(10, ' ').collect();
                if fields.len() != 10 {
                    return Err(invalid("Git returned a malformed renamed change"));
                }
                let original = records
                    .next()
                    .ok_or_else(|| invalid("Git omitted the original rename path"))?;
                push_change(
                    &mut result.changes,
                    fields[9],
                    Some(original.to_string()),
                    fields[1],
                );
            } else if line.starts_with("u ") {
                let fields: Vec<_> = line.splitn(11, ' ').collect();
                if fields.len() != 11 {
                    return Err(invalid("Git returned a malformed conflicted change"));
                }
                push_change(&mut result.changes, fields[10], None, "UU");
            }
        }
    }

    Ok(result)
}

/// `git version 2.47.1.windows.2` becomes `(2, 47, 1)`. A missing patch number counts as 0.
pub fn parse_git_version(output: &str) -> Option<(u32, u32, u32)> {
    let version = output.trim().strip_prefix("git version ")?;
    let mut numbers = version
        .split(|c: char| !c.is_ascii_digit() && c != '.')
        .next()?
        .split('.')
        .map(|part| part.parse::<u32>().ok());
    let major = numbers.next()??;
    let minor = numbers.next()??;
    let patch = numbers.next().flatten().unwrap_or(0);
    Some((major, minor, patch))
}

/// RustPilot needs Git 2.30 or newer.
pub fn check_git_version(version: Option<(u32, u32, u32)>) -> Result<(), AppError> {
    match version {
        None => Err(AppError::new(ErrorKind::GitMissing, "Git was not found. Install Git for Windows and restart RustPilot.")),
        Some((major, minor, _)) if (major, minor) < (2, 30) => Err(AppError::new(
            ErrorKind::GitTooOld,
            format!("Git {major}.{minor} is too old. RustPilot needs Git 2.30 or newer."),
        )),
        Some(_) => Ok(()),
    }
}

/// What the `.git` file of a submodule or linked worktree says about where its Git folder is.
pub fn kind_from_git_file(content: &str) -> RepositoryKind {
    let target = content.trim().strip_prefix("gitdir:").unwrap_or("").replace('\\', "/");
    if target.contains("/modules/") {
        RepositoryKind::Submodule
    } else if target.contains("/worktrees/") {
        RepositoryKind::Worktree
    } else {
        RepositoryKind::Repository
    }
}
