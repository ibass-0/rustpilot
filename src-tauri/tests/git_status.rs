use std::path::Path;

use rustpilot_lib::application::git::{parse_status, stage, status, unstage};
use rustpilot_lib::domain::error::AppError;
use rustpilot_lib::domain::git::GitChangeKind;
use rustpilot_lib::domain::ports::GitRepository;

struct FakeGit(Option<Vec<u8>>);

impl GitRepository for FakeGit {
    fn repositories(&self, _root: &Path) -> Result<Vec<std::path::PathBuf>, AppError> {
        Ok(Vec::new())
    }
    fn status(&self, _root: &Path) -> Result<Option<Vec<u8>>, AppError> {
        Ok(self.0.clone())
    }
    fn diff(&self, _root: &Path, _path: &str, _staged: bool) -> Result<String, AppError> {
        Ok(String::new())
    }
    fn stage(&self, _root: &Path, _paths: &[String]) -> Result<(), AppError> {
        Ok(())
    }
    fn unstage(&self, _root: &Path, _paths: &[String]) -> Result<(), AppError> {
        Ok(())
    }
}

#[test]
fn a_non_repository_has_an_empty_status() {
    let result = status(&FakeGit(None), Path::new("C:/plain")).unwrap();
    assert!(!result.is_repository);
    assert!(result.branch.is_none());
    assert!(result.changes.is_empty());
}

#[test]
fn parses_branch_tracking_and_ordinary_changes() {
    let raw = concat!(
        "# branch.oid 0123456789012345678901234567890123456789\0",
        "# branch.head feature/git\0",
        "# branch.upstream origin/feature/git\0",
        "# branch.ab +2 -3\0",
        "1 M. N... 100644 100644 100644 aaa bbb src/staged.rs\0",
        "1 .M N... 100644 100644 100644 aaa bbb src/working.rs\0",
        "? new file.txt\0",
    );
    let result = parse_status(raw.as_bytes()).unwrap();
    assert_eq!(result.branch.as_deref(), Some("feature/git"));
    assert_eq!(result.upstream.as_deref(), Some("origin/feature/git"));
    assert_eq!((result.ahead, result.behind), (2, 3));
    assert_eq!(result.changes.len(), 3);
    assert!(result.changes[0].staged);
    assert!(!result.changes[1].staged);
    assert_eq!(result.changes[2].kind, GitChangeKind::Untracked);
    assert_eq!(result.changes[2].path, "new file.txt");
}

#[test]
fn a_file_changed_in_both_places_has_two_entries() {
    let raw = "1 MM N... 100644 100644 100644 aaa bbb src/both.rs\0";
    let result = parse_status(raw.as_bytes()).unwrap();
    assert_eq!(result.changes.len(), 2);
    assert!(result.changes[0].staged);
    assert!(!result.changes[1].staged);
}

#[test]
fn parses_rename_with_original_path() {
    let raw = "2 R. N... 100644 100644 100644 aaa bbb R100 src/new name.rs\0src/old name.rs\0";
    let result = parse_status(raw.as_bytes()).unwrap();
    assert_eq!(result.changes.len(), 1);
    assert_eq!(result.changes[0].kind, GitChangeKind::Renamed);
    assert_eq!(result.changes[0].path, "src/new name.rs");
    assert_eq!(
        result.changes[0].original_path.as_deref(),
        Some("src/old name.rs")
    );
}

#[test]
fn parses_conflict_and_detached_head() {
    let raw = concat!(
        "# branch.oid abcdef0123456789012345678901234567890123\0",
        "# branch.head (detached)\0",
        "u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.txt\0",
    );
    let result = parse_status(raw.as_bytes()).unwrap();
    assert!(result.detached);
    assert_eq!(result.branch.as_deref(), Some("abcdef0"));
    assert_eq!(result.changes[0].kind, GitChangeKind::Conflicted);
}

#[test]
fn rejects_malformed_records_and_non_utf8() {
    assert!(parse_status(b"1 M. too-short\0").is_err());
    assert!(parse_status(&[0xff, 0]).is_err());
}

#[test]
fn mutations_require_at_least_one_path_and_return_fresh_status() {
    let git = FakeGit(Some(b"# branch.head main\0".to_vec()));
    assert!(stage(&git, Path::new("C:/p"), &[]).is_err());
    assert!(unstage(&git, Path::new("C:/p"), &[]).is_err());
    let refreshed = stage(&git, Path::new("C:/p"), &["a b.rs".into()]).unwrap();
    assert_eq!(refreshed.branch.as_deref(), Some("main"));
}
