use std::fs;
use std::path::Path;
use std::process::Command;

use rustpilot_lib::application::git::{HunkAction, apply_hunk, file_versions, stage, status};
use rustpilot_lib::domain::ports::GitRepository;
use rustpilot_lib::infrastructure::git_cli::GitCli;
use tempfile::{TempDir, tempdir};

fn git(root: &Path, args: &[&str]) -> String {
    let output = Command::new("git").arg("-C").arg(root).args(["-c", "commit.gpgSign=false", "-c", "core.autocrlf=false"]).args(args).output().unwrap();
    assert!(output.status.success(), "{args:?}: {}", String::from_utf8_lossy(&output.stderr));
    String::from_utf8_lossy(&output.stdout).into_owned()
}

fn lines(n: usize, tag: &str) -> String {
    (1..=n).map(|i| if tag.is_empty() { format!("line {i}\n") } else { format!("line {i} {tag}\n") }).collect()
}

/// A repository whose `f.txt` has 30 lines, committed.
fn repo() -> TempDir {
    let dir = tempdir().unwrap();
    git(dir.path(), &["init", "--quiet", "-b", "main"]);
    git(dir.path(), &["config", "user.name", "T"]);
    git(dir.path(), &["config", "user.email", "t@example.invalid"]);
    fs::write(dir.path().join("f.txt"), lines(30, "")).unwrap();
    git(dir.path(), &["add", "-A"]);
    git(dir.path(), &["commit", "--quiet", "-m", "init"]);
    dir
}

/// Change line 2 and line 28, which makes two separate hunks.
fn edit_two_places(root: &Path) {
    let text = lines(30, "").replace("line 2\n", "line 2 CHANGED\n").replace("line 28\n", "line 28 CHANGED\n");
    fs::write(root.join("f.txt"), text).unwrap();
}

/// The diff header plus hunk number `index` (0-based), as a patch Git can apply.
fn hunk_patch(diff: &str, index: usize) -> String {
    let start = diff.find("\n@@").expect("a hunk") + 1;
    let header = &diff[..start];
    let hunks: Vec<String> = diff[start..].split("\n@@").enumerate().map(|(i, h)| if i == 0 { h.to_string() } else { format!("@@{h}") }).collect();
    let mut patch = format!("{header}{}", hunks[index]);
    if !patch.ends_with('\n') {
        patch.push('\n');
    }
    patch
}

fn text(root: &Path) -> String {
    fs::read_to_string(root.join("f.txt")).unwrap().replace("\r\n", "\n")
}

#[test]
fn staging_one_hunk_leaves_the_other_unstaged() {
    let dir = repo();
    edit_two_places(dir.path());
    let diff = GitCli.diff(dir.path(), "f.txt", false).unwrap();
    apply_hunk(&GitCli, dir.path(), &hunk_patch(&diff, 0), HunkAction::Stage).unwrap();
    let after = status(&GitCli, dir.path()).unwrap();
    assert_eq!(after.changes.len(), 2, "the file is staged and changed");
    assert!(after.changes.iter().any(|c| c.staged) && after.changes.iter().any(|c| !c.staged));
    let staged = GitCli.diff(dir.path(), "f.txt", true).unwrap();
    assert!(staged.contains("line 2 CHANGED") && !staged.contains("line 28 CHANGED"));
}

#[test]
fn unstaging_a_hunk_takes_just_that_hunk_out_of_the_index() {
    let dir = repo();
    edit_two_places(dir.path());
    stage(&GitCli, dir.path(), &["f.txt".to_string()]).unwrap();
    let staged = GitCli.diff(dir.path(), "f.txt", true).unwrap();
    apply_hunk(&GitCli, dir.path(), &hunk_patch(&staged, 1), HunkAction::Unstage).unwrap();
    let still_staged = GitCli.diff(dir.path(), "f.txt", true).unwrap();
    assert!(still_staged.contains("line 2 CHANGED") && !still_staged.contains("line 28 CHANGED"));
    assert!(text(dir.path()).contains("line 28 CHANGED"), "the working file is untouched");
}

#[test]
fn discarding_a_hunk_reverts_it_in_the_working_file_only() {
    let dir = repo();
    edit_two_places(dir.path());
    let diff = GitCli.diff(dir.path(), "f.txt", false).unwrap();
    apply_hunk(&GitCli, dir.path(), &hunk_patch(&diff, 1), HunkAction::Discard).unwrap();
    let now = text(dir.path());
    assert!(now.contains("line 2 CHANGED"));
    assert!(!now.contains("line 28 CHANGED"));
    assert!(now.contains("line 28\n"));
}

#[test]
fn a_patch_that_does_not_apply_is_reported_and_changes_nothing() {
    let dir = repo();
    edit_two_places(dir.path());
    let diff = GitCli.diff(dir.path(), "f.txt", false).unwrap();
    let patch = hunk_patch(&diff, 0);
    apply_hunk(&GitCli, dir.path(), &patch, HunkAction::Stage).unwrap();
    let before = text(dir.path());
    let err = apply_hunk(&GitCli, dir.path(), &patch, HunkAction::Stage).unwrap_err();
    assert!(!err.message.is_empty());
    assert_eq!(text(dir.path()), before);
}

#[test]
fn an_empty_or_foreign_patch_is_refused() {
    let dir = repo();
    assert!(apply_hunk(&GitCli, dir.path(), "", HunkAction::Stage).is_err());
    assert!(apply_hunk(&GitCli, dir.path(), "not a patch", HunkAction::Discard).is_err());
}

#[test]
fn file_versions_for_an_unstaged_file_are_the_index_and_the_working_copy() {
    let dir = repo();
    edit_two_places(dir.path());
    let versions = file_versions(&GitCli, dir.path(), "f.txt", false).unwrap();
    assert_eq!(versions.original.as_deref().map(|t| t.replace("\r\n", "\n")), Some(lines(30, "")));
    assert!(versions.modified.unwrap().contains("line 2 CHANGED"));
}

#[test]
fn file_versions_for_a_staged_file_are_head_and_the_index() {
    let dir = repo();
    edit_two_places(dir.path());
    stage(&GitCli, dir.path(), &["f.txt".to_string()]).unwrap();
    fs::write(dir.path().join("f.txt"), "working copy differs again\n").unwrap();
    let versions = file_versions(&GitCli, dir.path(), "f.txt", true).unwrap();
    assert!(versions.original.unwrap().contains("line 2\n"));
    assert!(versions.modified.unwrap().contains("line 2 CHANGED"));
}

#[test]
fn a_new_file_has_no_original_and_a_deleted_file_has_no_modified_side() {
    let dir = repo();
    fs::write(dir.path().join("new.txt"), "hello\n").unwrap();
    let added = file_versions(&GitCli, dir.path(), "new.txt", false).unwrap();
    assert_eq!(added.original, None);
    assert_eq!(added.modified.as_deref().map(str::trim), Some("hello"));

    fs::remove_file(dir.path().join("f.txt")).unwrap();
    let removed = file_versions(&GitCli, dir.path(), "f.txt", false).unwrap();
    assert!(removed.original.is_some());
    assert_eq!(removed.modified, None);
}

#[test]
fn binary_files_are_refused() {
    let dir = repo();
    fs::write(dir.path().join("b.bin"), [0u8, 159, 146, 150, 0, 1]).unwrap();
    git(dir.path(), &["add", "b.bin"]);
    git(dir.path(), &["commit", "--quiet", "-m", "bin"]);
    fs::write(dir.path().join("b.bin"), [0u8, 1, 2, 3]).unwrap();
    assert!(file_versions(&GitCli, dir.path(), "b.bin", false).is_err());
}

#[test]
fn unsafe_paths_are_refused() {
    let dir = repo();
    assert!(file_versions(&GitCli, dir.path(), "../x", false).is_err());
    assert!(file_versions(&GitCli, dir.path(), "C:\\x", true).is_err());
}
