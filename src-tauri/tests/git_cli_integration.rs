use std::fs;
use std::process::Command;

use rustpilot_lib::application::git::status;
use rustpilot_lib::domain::ports::GitRepository;
use rustpilot_lib::infrastructure::git_cli::GitCli;
use tempfile::tempdir;

fn git(root: &std::path::Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn status_stage_and_unstage_work_against_a_real_repository() {
    let dir = tempdir().unwrap();
    git(dir.path(), &["init", "--quiet"]);
    git(dir.path(), &["config", "user.name", "RustPilot Test"]);
    git(
        dir.path(),
        &["config", "user.email", "rustpilot@example.invalid"],
    );
    git(dir.path(), &["config", "commit.gpgSign", "false"]);
    fs::write(dir.path().join("file with spaces.txt"), "one\n").unwrap();
    git(dir.path(), &["add", "--", "file with spaces.txt"]);
    git(dir.path(), &["commit", "--quiet", "-m", "initial"]);
    fs::write(dir.path().join("file with spaces.txt"), "two\n").unwrap();

    let repository = GitCli;
    let found = repository.repositories(dir.path()).unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!(std::path::PathBuf::from(&found[0].root), dir.path().to_path_buf());
    let working = status(&repository, dir.path()).unwrap();
    assert_eq!(working.changes.len(), 1);
    assert!(!working.changes[0].staged);
    assert_eq!(working.changes[0].path, "file with spaces.txt");

    repository
        .stage(dir.path(), &["file with spaces.txt".into()])
        .unwrap();
    let staged = status(&repository, dir.path()).unwrap();
    assert_eq!(staged.changes.len(), 1);
    assert!(staged.changes[0].staged);

    repository
        .unstage(dir.path(), &["file with spaces.txt".into()])
        .unwrap();
    let unstaged = status(&repository, dir.path()).unwrap();
    assert_eq!(unstaged.changes.len(), 1);
    assert!(!unstaged.changes[0].staged);

    fs::write(dir.path().join("new file.txt"), "new line\n").unwrap();
    let untracked_diff = repository.diff(dir.path(), "new file.txt", false).unwrap();
    assert!(untracked_diff.contains("new file.txt"));
    assert!(untracked_diff.contains("+new line"));
}
