use std::fs;
use std::path::Path;
use std::process::Command;

use rustpilot_lib::application::git::{commit, discard, last_message, stage, stage_all, status, unstage_all};
use rustpilot_lib::domain::git::{GitChangeKind, GitStatus};
use rustpilot_lib::infrastructure::git_cli::GitCli;
use tempfile::{TempDir, tempdir};

fn git(root: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["-c", "commit.gpgSign=false"])
        .args(args)
        .output()
        .unwrap();
    assert!(output.status.success(), "{args:?}: {}", String::from_utf8_lossy(&output.stderr));
    String::from_utf8_lossy(&output.stdout).into_owned()
}

fn repository() -> TempDir {
    let dir = tempdir().unwrap();
    git(dir.path(), &["init", "--quiet", "-b", "main"]);
    git(dir.path(), &["config", "user.name", "RustPilot Test"]);
    git(dir.path(), &["config", "user.email", "rustpilot@example.invalid"]);
    dir
}

fn write(root: &Path, name: &str, text: &str) {
    let path = root.join(name);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, text).unwrap();
}

fn committed(files: &[(&str, &str)]) -> TempDir {
    let dir = repository();
    for (name, text) in files {
        write(dir.path(), name, text);
    }
    git(dir.path(), &["add", "-A"]);
    git(dir.path(), &["commit", "--quiet", "-m", "initial"]);
    dir
}

fn current(root: &Path) -> GitStatus {
    status(&GitCli, root).unwrap()
}

fn s(items: &[&str]) -> Vec<String> {
    items.iter().map(|i| i.to_string()).collect()
}

fn message_of_head(root: &Path) -> String {
    git(root, &["log", "-1", "--format=%B"]).trim_end().to_string()
}

fn commit_count(root: &Path) -> usize {
    git(root, &["rev-list", "--count", "HEAD"]).trim().parse().unwrap()
}

// ---------- commit ----------

#[test]
fn commits_what_is_staged() {
    let dir = committed(&[("a.txt", "one\n")]);
    write(dir.path(), "a.txt", "two\n");
    stage(&GitCli, dir.path(), &s(&["a.txt"])).unwrap();
    let after = commit(&GitCli, dir.path(), "second", false, false).unwrap();
    assert!(after.changes.is_empty());
    assert_eq!(message_of_head(dir.path()), "second");
    assert_eq!(commit_count(dir.path()), 2);
}

#[test]
fn only_the_staged_part_is_committed() {
    let dir = committed(&[("a.txt", "one\n"), ("b.txt", "one\n")]);
    write(dir.path(), "a.txt", "two\n");
    write(dir.path(), "b.txt", "two\n");
    stage(&GitCli, dir.path(), &s(&["a.txt"])).unwrap();
    let after = commit(&GitCli, dir.path(), "only a", false, false).unwrap();
    assert_eq!(after.changes.len(), 1);
    assert_eq!(after.changes[0].path, "b.txt");
    assert!(!after.changes[0].staged);
}

#[test]
fn messages_with_quotes_newlines_unicode_and_a_leading_dash_survive() {
    let dir = committed(&[("a.txt", "one\n")]);
    write(dir.path(), "a.txt", "two\n");
    stage(&GitCli, dir.path(), &s(&["a.txt"])).unwrap();
    let message = "-fix: handle \"quotes\" and 'apostrophes' & $VARS `ticks`\n\nBody with \u{e9} and \u{65e5}\u{672c}\u{8a9e}\n- bullet";
    commit(&GitCli, dir.path(), message, false, false).unwrap();
    assert_eq!(message_of_head(dir.path()), message);
}

#[test]
fn a_blank_message_is_refused_before_git_runs() {
    let dir = committed(&[("a.txt", "one\n")]);
    write(dir.path(), "a.txt", "two\n");
    stage(&GitCli, dir.path(), &s(&["a.txt"])).unwrap();
    for message in ["", "   ", "\n\n"] {
        let err = commit(&GitCli, dir.path(), message, false, false).unwrap_err();
        assert_eq!(err.message, "Enter a commit message.");
    }
    assert_eq!(commit_count(dir.path()), 1);
}

#[test]
fn a_message_with_a_nul_byte_is_refused() {
    let dir = committed(&[("a.txt", "one\n")]);
    write(dir.path(), "a.txt", "two\n");
    stage(&GitCli, dir.path(), &s(&["a.txt"])).unwrap();
    assert!(commit(&GitCli, dir.path(), "bad\0message", false, false).is_err());
}

#[test]
fn nothing_staged_is_refused_with_a_clear_message() {
    let dir = committed(&[("a.txt", "one\n")]);
    write(dir.path(), "a.txt", "two\n");
    let err = commit(&GitCli, dir.path(), "nothing", false, false).unwrap_err();
    assert_eq!(err.message, "There is nothing staged to commit.");
}

#[test]
fn the_first_commit_of_a_new_repository_works() {
    let dir = repository();
    write(dir.path(), "a.txt", "one\n");
    stage(&GitCli, dir.path(), &s(&["a.txt"])).unwrap();
    commit(&GitCli, dir.path(), "first", false, false).unwrap();
    assert_eq!(commit_count(dir.path()), 1);
}

#[test]
fn amend_rewrites_the_last_commit_instead_of_adding_one() {
    let dir = committed(&[("a.txt", "one\n")]);
    commit_with_change(dir.path(), "a.txt", "two\n", "second");
    assert_eq!(commit_count(dir.path()), 2);
    commit(&GitCli, dir.path(), "second, reworded", true, false).unwrap();
    assert_eq!(commit_count(dir.path()), 2);
    assert_eq!(message_of_head(dir.path()), "second, reworded");
}

fn commit_with_change(root: &Path, name: &str, text: &str, message: &str) {
    write(root, name, text);
    stage(&GitCli, root, &[name.to_string()]).unwrap();
    commit(&GitCli, root, message, false, false).unwrap();
}

#[test]
fn amend_picks_up_newly_staged_files() {
    let dir = committed(&[("a.txt", "one\n")]);
    commit_with_change(dir.path(), "a.txt", "two\n", "second");
    write(dir.path(), "b.txt", "new\n");
    stage(&GitCli, dir.path(), &s(&["b.txt"])).unwrap();
    commit(&GitCli, dir.path(), "second", true, false).unwrap();
    let files = git(dir.path(), &["show", "--name-only", "--format=", "HEAD"]);
    assert!(files.contains("a.txt") && files.contains("b.txt"), "{files}");
}

#[test]
fn amend_needs_nothing_staged() {
    let dir = committed(&[("a.txt", "one\n")]);
    commit(&GitCli, dir.path(), "just the message", true, false).unwrap();
    assert_eq!(message_of_head(dir.path()), "just the message");
}

#[test]
fn sign_off_adds_the_trailer() {
    let dir = committed(&[("a.txt", "one\n")]);
    write(dir.path(), "a.txt", "two\n");
    stage(&GitCli, dir.path(), &s(&["a.txt"])).unwrap();
    commit(&GitCli, dir.path(), "signed", false, true).unwrap();
    assert!(message_of_head(dir.path()).contains("Signed-off-by: RustPilot Test <rustpilot@example.invalid>"));
}

#[test]
fn a_failing_hook_is_reported_with_its_own_words_and_commits_nothing() {
    let dir = committed(&[("a.txt", "one\n")]);
    let hook = dir.path().join(".git/hooks/pre-commit");
    fs::create_dir_all(hook.parent().unwrap()).unwrap();
    fs::write(&hook, "#!/bin/sh\necho 'lint failed: fix the style' >&2\nexit 1\n").unwrap();
    write(dir.path(), "a.txt", "two\n");
    stage(&GitCli, dir.path(), &s(&["a.txt"])).unwrap();
    let err = commit(&GitCli, dir.path(), "blocked", false, false).unwrap_err();
    assert!(err.message.contains("lint failed: fix the style"), "{}", err.message);
    assert_eq!(commit_count(dir.path()), 1);
}

#[test]
fn no_temporary_message_file_is_left_behind() {
    let dir = committed(&[("a.txt", "one\n")]);
    let marker = format!("TIDY-MARKER-{}", std::process::id());
    write(dir.path(), "a.txt", "two\n");
    stage(&GitCli, dir.path(), &s(&["a.txt"])).unwrap();
    commit(&GitCli, dir.path(), &format!("{marker} success"), false, false).unwrap();
    // Nothing is staged now, so this one fails after the message file could have been written.
    let _ = commit(&GitCli, dir.path(), &format!("{marker} failure"), true, false);
    write(dir.path(), "a.txt", "three\n");
    stage(&GitCli, dir.path(), &s(&["a.txt"])).unwrap();
    let hook = dir.path().join(".git/hooks/pre-commit");
    fs::create_dir_all(hook.parent().unwrap()).unwrap();
    fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
    let _ = commit(&GitCli, dir.path(), &format!("{marker} hook"), false, false);
    // Other tests run at the same time and have message files of their own; only ours are checked.
    let ours = fs::read_dir(std::env::temp_dir())
        .unwrap()
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("rustpilot-commit-"))
        .filter(|e| fs::read_to_string(e.path()).is_ok_and(|text| text.contains(&marker)))
        .count();
    assert_eq!(ours, 0);
}

/// Windows Git may check files out with CRLF; the content is what matters here.
fn text_of(path: &Path) -> String {
    fs::read_to_string(path).unwrap().replace("\r\n", "\n")
}

// ---------- last message ----------

#[test]
fn the_last_message_is_read_back_whole() {
    let dir = repository();
    assert_eq!(last_message(&GitCli, dir.path()).unwrap(), None);
    write(dir.path(), "a.txt", "one\n");
    stage(&GitCli, dir.path(), &s(&["a.txt"])).unwrap();
    commit(&GitCli, dir.path(), "subject\n\nbody text", false, false).unwrap();
    assert_eq!(last_message(&GitCli, dir.path()).unwrap().as_deref(), Some("subject\n\nbody text"));
}

// ---------- discard ----------

#[test]
fn discarding_restores_a_modified_file() {
    let dir = committed(&[("a.txt", "one\n")]);
    write(dir.path(), "a.txt", "scribbles\n");
    let after = discard(&GitCli, dir.path(), &s(&["a.txt"]), &[]).unwrap();
    assert!(after.changes.is_empty());
    assert_eq!(text_of(&dir.path().join("a.txt")), "one\n");
}

#[test]
fn discarding_brings_back_a_deleted_file() {
    let dir = committed(&[("a.txt", "one\n")]);
    fs::remove_file(dir.path().join("a.txt")).unwrap();
    discard(&GitCli, dir.path(), &s(&["a.txt"]), &[]).unwrap();
    assert!(dir.path().join("a.txt").exists());
}

#[test]
fn discarding_removes_untracked_files_and_folders() {
    let dir = committed(&[("a.txt", "one\n")]);
    write(dir.path(), "new.txt", "x\n");
    write(dir.path(), "fresh/deep/file.txt", "x\n");
    let after = discard(&GitCli, dir.path(), &[], &s(&["new.txt", "fresh"])).unwrap();
    assert!(after.changes.is_empty());
    assert!(!dir.path().join("new.txt").exists());
    assert!(!dir.path().join("fresh").exists());
}

#[test]
fn discarding_the_working_changes_keeps_what_is_staged() {
    let dir = committed(&[("a.txt", "one\n")]);
    write(dir.path(), "a.txt", "two\n");
    stage(&GitCli, dir.path(), &s(&["a.txt"])).unwrap();
    write(dir.path(), "a.txt", "three\n");
    let after = discard(&GitCli, dir.path(), &s(&["a.txt"]), &[]).unwrap();
    assert_eq!(text_of(&dir.path().join("a.txt")), "two\n");
    assert_eq!(after.changes.len(), 1);
    assert!(after.changes[0].staged);
}

#[test]
fn discard_touches_only_the_paths_it_was_given() {
    let dir = committed(&[("a.txt", "one\n"), ("b.txt", "one\n")]);
    write(dir.path(), "a.txt", "x\n");
    write(dir.path(), "b.txt", "y\n");
    write(dir.path(), "keep.txt", "keep\n");
    discard(&GitCli, dir.path(), &s(&["a.txt"]), &[]).unwrap();
    assert_eq!(text_of(&dir.path().join("b.txt")), "y\n");
    assert!(dir.path().join("keep.txt").exists());
}

#[test]
fn paths_with_spaces_and_odd_names_are_handled() {
    let dir = committed(&[("dir with space/file name.txt", "one\n"), ("--looks-like-option", "one\n")]);
    write(dir.path(), "dir with space/file name.txt", "x\n");
    write(dir.path(), "--looks-like-option", "x\n");
    discard(&GitCli, dir.path(), &s(&["dir with space/file name.txt", "--looks-like-option"]), &[]).unwrap();
    assert!(current(dir.path()).changes.is_empty());
}

#[test]
fn unsafe_paths_are_refused_and_nothing_is_touched() {
    let dir = committed(&[("a.txt", "one\n")]);
    write(dir.path(), "a.txt", "keep my edit\n");
    for bad in ["", "../outside.txt", "sub/../../outside.txt", "C:\\Windows\\x", "/etc/passwd", "\\\\server\\share\\x", "a\0b"] {
        assert!(discard(&GitCli, dir.path(), &[bad.to_string()], &[]).is_err(), "{bad:?} should be refused");
        assert!(discard(&GitCli, dir.path(), &[], &[bad.to_string()]).is_err(), "{bad:?} should be refused for untracked");
    }
    assert_eq!(text_of(&dir.path().join("a.txt")), "keep my edit\n");
}

#[test]
fn discarding_nothing_is_an_error() {
    let dir = committed(&[("a.txt", "one\n")]);
    assert!(discard(&GitCli, dir.path(), &[], &[]).is_err());
}

// ---------- stage all / unstage all ----------

#[test]
fn stage_all_and_unstage_all_cover_new_changed_and_deleted_files() {
    let dir = committed(&[("a.txt", "one\n"), ("gone.txt", "bye\n")]);
    write(dir.path(), "a.txt", "two\n");
    write(dir.path(), "new.txt", "x\n");
    fs::remove_file(dir.path().join("gone.txt")).unwrap();

    let staged = stage_all(&GitCli, dir.path()).unwrap();
    assert_eq!(staged.changes.len(), 3);
    assert!(staged.changes.iter().all(|c| c.staged));
    assert!(staged.changes.iter().any(|c| c.kind == GitChangeKind::Deleted));

    let unstaged = unstage_all(&GitCli, dir.path()).unwrap();
    assert!(unstaged.changes.iter().all(|c| !c.staged));
    assert_eq!(unstaged.changes.len(), 3);
}

#[test]
fn unstage_all_works_before_the_first_commit() {
    let dir = repository();
    write(dir.path(), "a.txt", "one\n");
    stage_all(&GitCli, dir.path()).unwrap();
    let after = unstage_all(&GitCli, dir.path()).unwrap();
    assert_eq!(after.changes.len(), 1);
    assert!(!after.changes[0].staged);
}
