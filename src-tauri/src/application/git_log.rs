//! History queries: the log with its graph, commit details, comparisons and the list of refs.
//! Every call builds its Git arguments here, so values that came from the UI can only ever be a
//! revision, a path or the value of an option, never an option of their own.

use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::application::git::validate_repository_path;
use crate::domain::error::{AppError, ErrorKind};
use crate::domain::git_graph::{GraphRow, LaneSlot, Lanes, LogCommit, RefKind, RefLabel, layout_graph};
use crate::domain::ports::GitRepository;

const MAX_PAGE: usize = 1000;
const UNIT: char = '\u{1f}';
const RECORD: char = '\u{1e}';

fn invalid(message: impl Into<String>) -> AppError {
    AppError::new(ErrorKind::Io, message)
}

// ---------- requests and answers ----------

/// Which commits the log starts from.
#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "refs")]
pub enum Scope {
    /// Every branch, tag and remote branch.
    #[default]
    All,
    /// What is reachable from the checked-out commit.
    Head,
    /// Only these branches or tags.
    Refs(Vec<String>),
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LogRequest {
    pub limit: usize,
    pub skip: usize,
    pub scope: Scope,
    /// Text in the commit message.
    pub search: Option<String>,
    pub author: Option<String>,
    pub since: Option<String>,
    pub until: Option<String>,
    /// Only commits that touched this file or folder.
    pub path: Option<String>,
    /// The lanes left open by the previous page.
    pub lane_state: Lanes,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphCommit {
    #[serde(flatten)]
    pub commit: LogCommit,
    /// `None` in a filtered list, where lanes would be misleading.
    pub graph: Option<GraphRow>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogPage {
    pub commits: Vec<GraphCommit>,
    pub has_more: bool,
    /// Pass this back as `lane_state` to continue with the next page.
    pub lane_state: Lanes,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitFile {
    pub path: String,
    pub old_path: Option<String>,
    /// `A`dded, `M`odified, `D`eleted, `R`enamed, `C`opied or `T` (type change).
    pub status: String,
    /// `None` for binary files.
    pub insertions: Option<u32>,
    pub deletions: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetails {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub committer: String,
    pub committer_email: String,
    pub committer_timestamp: i64,
    pub message: String,
    pub files: Vec<CommitFile>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefInfo {
    pub name: String,
    pub kind: RefKind,
    pub hash: String,
    pub current: bool,
}

// ---------- validation ----------

/// A hash, a branch, a tag or `HEAD`, possibly with `^` or `~n`. Never something that starts like an option.
fn validate_revision(revision: &str) -> Result<(), AppError> {
    let allowed = |c: char| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '/' | '@' | '^' | '~' | '-' | '+');
    if revision.is_empty()
        || revision.len() > 200
        || revision.starts_with('-')
        || revision.contains("..")
        || !revision.chars().all(allowed)
    {
        return Err(invalid(format!("Not a valid revision: {revision:?}")));
    }
    Ok(())
}

// ---------- log ----------

/// `HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1, refs/stash` as labels.
pub fn parse_refs(decoration: &str) -> Vec<RefLabel> {
    let mut labels = Vec::new();
    for item in decoration.split(", ").map(str::trim).filter(|i| !i.is_empty()) {
        if let Some(branch) = item.strip_prefix("HEAD -> ") {
            labels.push(RefLabel { name: "HEAD".into(), kind: RefKind::Head, current: false });
            labels.push(RefLabel { name: branch.trim_start_matches("refs/heads/").to_string(), kind: RefKind::Branch, current: true });
        } else if item == "HEAD" {
            labels.push(RefLabel { name: "HEAD".into(), kind: RefKind::Head, current: false });
        } else if let Some(tag) = item.strip_prefix("tag: ") {
            labels.push(RefLabel { name: tag.trim_start_matches("refs/tags/").to_string(), kind: RefKind::Tag, current: false });
        } else if let Some(branch) = item.strip_prefix("refs/heads/") {
            labels.push(RefLabel { name: branch.to_string(), kind: RefKind::Branch, current: false });
        } else if let Some(remote) = item.strip_prefix("refs/remotes/") {
            if !remote.ends_with("/HEAD") {
                labels.push(RefLabel { name: remote.to_string(), kind: RefKind::Remote, current: false });
            }
        } else if item == "refs/stash" {
            labels.push(RefLabel { name: "stash".into(), kind: RefKind::Stash, current: false });
        }
    }
    labels
}

fn parse_log(output: &[u8]) -> Vec<LogCommit> {
    String::from_utf8_lossy(output)
        .split(RECORD)
        .filter_map(|record| {
            let fields: Vec<&str> = record.trim_start_matches('\n').split(UNIT).collect();
            if fields.len() < 7 || fields[0].len() < 7 {
                return None;
            }
            Some(LogCommit {
                hash: fields[0].to_string(),
                parents: fields[1].split_whitespace().map(String::from).collect(),
                author: fields[2].to_string(),
                email: fields[3].to_string(),
                timestamp: fields[4].parse().unwrap_or(0),
                refs: parse_refs(fields[5]),
                subject: fields[6].to_string(),
            })
        })
        .collect()
}

/// A page of the log, with its graph unless the list is filtered.
pub fn log(repository: &dyn GitRepository, root: &Path, request: &LogRequest) -> Result<LogPage, AppError> {
    let limit = request.limit.clamp(1, MAX_PAGE);
    let mut args: Vec<String> = vec![
        "log".into(),
        "--topo-order".into(),
        "--no-color".into(),
        "--decorate=full".into(),
        format!("--format=%H{UNIT}%P{UNIT}%an{UNIT}%ae{UNIT}%at{UNIT}%D{UNIT}%s{RECORD}"),
        format!("--max-count={}", limit + 1),
        format!("--skip={}", request.skip),
    ];
    let mut filtered = false;
    let mut value = |args: &mut Vec<String>, option: &str, text: &Option<String>| {
        if let Some(text) = text.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
            args.push(format!("--{option}={text}"));
            filtered = true;
        }
    };
    value(&mut args, "author", &request.author);
    value(&mut args, "since", &request.since);
    value(&mut args, "until", &request.until);
    if request.search.as_deref().is_some_and(|s| !s.trim().is_empty()) {
        args.push("--regexp-ignore-case".into());
        args.push("--fixed-strings".into());
        value(&mut args, "grep", &request.search);
    }
    match &request.scope {
        Scope::All => args.push("--all".into()),
        Scope::Head => args.push("HEAD".into()),
        Scope::Refs(refs) => {
            if refs.is_empty() {
                return Err(invalid("Choose at least one branch."));
            }
            for name in refs {
                validate_revision(name)?;
                args.push(name.clone());
            }
        }
    }
    args.push("--".into());
    if let Some(path) = request.path.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        validate_repository_path(path)?;
        args.push(path.to_string());
        filtered = true;
    }

    let output = match repository.query(root, &args) {
        Ok(output) => output,
        // A repository without commits has nothing to list.
        Err(err) if err.message.contains("does not have any commits") || err.message.contains("bad default revision") => Vec::new(),
        Err(err) => return Err(err),
    };
    let mut commits = parse_log(&output);
    let has_more = commits.len() > limit;
    commits.truncate(limit);
    if filtered {
        let commits = commits.into_iter().map(|commit| GraphCommit { commit, graph: None }).collect();
        return Ok(LogPage { commits, has_more, lane_state: Vec::new() });
    }
    let (rows, lane_state) = layout_graph(&commits, &request.lane_state);
    let commits = commits.into_iter().zip(rows).map(|(commit, row)| GraphCommit { commit, graph: Some(row) }).collect();
    Ok(LogPage { commits, has_more, lane_state })
}

// ---------- details ----------

fn tokens(output: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(output).split('\0').map(String::from).collect()
}

/// `git diff --name-status -z` output as (status letter, path, old path).
fn parse_name_status(output: &[u8]) -> Vec<(String, String, Option<String>)> {
    let tokens = tokens(output);
    let mut files = Vec::new();
    let mut i = 0;
    while i < tokens.len() {
        let status = tokens[i].trim();
        if status.is_empty() {
            i += 1;
            continue;
        }
        let letter = status.chars().next().unwrap_or('M').to_string();
        if (letter == "R" || letter == "C") && i + 2 < tokens.len() {
            files.push((letter, tokens[i + 2].clone(), Some(tokens[i + 1].clone())));
            i += 3;
        } else if i + 1 < tokens.len() {
            files.push((letter, tokens[i + 1].clone(), None));
            i += 2;
        } else {
            break;
        }
    }
    files
}

/// `git diff --numstat -z` output as new path to (insertions, deletions); binary files give `None`.
fn parse_numstat(output: &[u8]) -> HashMap<String, (Option<u32>, Option<u32>)> {
    let tokens = tokens(output);
    let mut counts = HashMap::new();
    let mut i = 0;
    while i < tokens.len() {
        let token = tokens[i].trim_start_matches('\n');
        let mut parts = token.splitn(3, '\t');
        let (Some(ins), Some(del), Some(path)) = (parts.next(), parts.next(), parts.next()) else {
            i += 1;
            continue;
        };
        let numbers = (ins.parse().ok(), del.parse().ok());
        if path.is_empty() && i + 2 < tokens.len() {
            counts.insert(tokens[i + 2].clone(), numbers);
            i += 3;
        } else {
            counts.insert(path.to_string(), numbers);
            i += 1;
        }
    }
    counts
}

fn join_files(name_status: &[u8], numstat: &[u8]) -> Vec<CommitFile> {
    let counts = parse_numstat(numstat);
    parse_name_status(name_status)
        .into_iter()
        .map(|(status, path, old_path)| {
            let (insertions, deletions) = counts.get(&path).copied().unwrap_or((None, None));
            CommitFile { path, old_path, status, insertions, deletions }
        })
        .collect()
}

fn show_args(revision: &str, extra: &[&str]) -> Vec<String> {
    let mut args: Vec<String> = ["show", "--no-color", "--no-ext-diff", "-m", "--first-parent", "--format=", "-M"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    args.extend(extra.iter().map(|s| s.to_string()));
    args.push(revision.to_string());
    args
}

/// The message, people and changed files of one commit. A merge is shown against its first parent.
pub fn commit_details(repository: &dyn GitRepository, root: &Path, revision: &str) -> Result<CommitDetails, AppError> {
    validate_revision(revision)?;
    let meta = repository.query(
        root,
        &[
            "show".into(),
            "-s".into(),
            "--no-color".into(),
            format!("--format=%H{UNIT}%P{UNIT}%an{UNIT}%ae{UNIT}%at{UNIT}%cn{UNIT}%ce{UNIT}%ct{UNIT}%B"),
            revision.into(),
        ],
    )?;
    let text = String::from_utf8_lossy(&meta).into_owned();
    let fields: Vec<&str> = text.splitn(9, UNIT).collect();
    if fields.len() < 9 {
        return Err(invalid("Git returned an unexpected answer for that commit."));
    }
    let files = join_files(
        &repository.query(root, &show_args(revision, &["--name-status", "-z"]))?,
        &repository.query(root, &show_args(revision, &["--numstat", "-z"]))?,
    );
    Ok(CommitDetails {
        hash: fields[0].to_string(),
        parents: fields[1].split_whitespace().map(String::from).collect(),
        author: fields[2].to_string(),
        email: fields[3].to_string(),
        timestamp: fields[4].parse().unwrap_or(0),
        committer: fields[5].to_string(),
        committer_email: fields[6].to_string(),
        committer_timestamp: fields[7].parse().unwrap_or(0),
        message: fields[8].trim_end().to_string(),
        files,
    })
}

/// The diff of one file in a commit (against its first parent).
pub fn commit_file_diff(repository: &dyn GitRepository, root: &Path, revision: &str, path: &str) -> Result<String, AppError> {
    validate_revision(revision)?;
    validate_repository_path(path)?;
    let mut args = show_args(revision, &[]);
    args.push("--".into());
    args.push(path.into());
    Ok(String::from_utf8_lossy(&repository.query(root, &args)?).into_owned())
}

fn diff_args(a: &str, b: &str, extra: &[&str]) -> Vec<String> {
    let mut args: Vec<String> = ["diff", "--no-color", "--no-ext-diff", "-M"].iter().map(|s| s.to_string()).collect();
    args.extend(extra.iter().map(|s| s.to_string()));
    args.push(a.into());
    args.push(b.into());
    args
}

/// The files that differ between two commits.
pub fn compare_files(repository: &dyn GitRepository, root: &Path, a: &str, b: &str) -> Result<Vec<CommitFile>, AppError> {
    validate_revision(a)?;
    validate_revision(b)?;
    Ok(join_files(
        &repository.query(root, &diff_args(a, b, &["--name-status", "-z"]))?,
        &repository.query(root, &diff_args(a, b, &["--numstat", "-z"]))?,
    ))
}

/// The diff of one file between two commits.
pub fn compare_file_diff(repository: &dyn GitRepository, root: &Path, a: &str, b: &str, path: &str) -> Result<String, AppError> {
    validate_revision(a)?;
    validate_revision(b)?;
    validate_repository_path(path)?;
    let mut args = diff_args(a, b, &[]);
    args.push("--".into());
    args.push(path.into());
    Ok(String::from_utf8_lossy(&repository.query(root, &args)?).into_owned())
}

// ---------- refs ----------

/// Local branches, remote branches and tags, with the current branch marked.
pub fn list_refs(repository: &dyn GitRepository, root: &Path) -> Result<Vec<RefInfo>, AppError> {
    let output = repository.query(
        root,
        &[
            "for-each-ref".into(),
            format!("--format=%(refname){UNIT}%(objectname){UNIT}%(HEAD)"),
            "refs/heads".into(),
            "refs/remotes".into(),
            "refs/tags".into(),
        ],
    )?;
    Ok(String::from_utf8_lossy(&output)
        .lines()
        .filter_map(|line| {
            let mut fields = line.split(UNIT);
            let (full, hash, head) = (fields.next()?, fields.next()?, fields.next().unwrap_or(""));
            let (kind, name) = if let Some(name) = full.strip_prefix("refs/heads/") {
                (RefKind::Branch, name)
            } else if let Some(name) = full.strip_prefix("refs/remotes/") {
                if name.ends_with("/HEAD") {
                    return None;
                }
                (RefKind::Remote, name)
            } else {
                (RefKind::Tag, full.strip_prefix("refs/tags/")?)
            };
            Some(RefInfo { name: name.to_string(), kind, hash: hash.to_string(), current: head.trim() == "*" })
        })
        .collect())
}

/// The lanes of a page, re-exported so callers need only this module.
pub type LaneState = Vec<Option<LaneSlot>>;
