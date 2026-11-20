use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use rustpilot_lib::application::git_watch::{Debouncer, is_relevant};
use rustpilot_lib::infrastructure::git_watch::watch;
use tempfile::tempdir;

// ---------- which files matter ----------

#[test]
fn the_files_that_describe_repository_state_are_relevant() {
    for path in [
        "HEAD",
        "index",
        "packed-refs",
        "config",
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "REBASE_HEAD",
        "refs/heads/main",
        "refs/remotes/origin/feature/x",
        "refs/tags/v1",
        "refs/stash",
        "rebase-merge",
        "rebase-merge/done",
        "rebase-apply/next",
    ] {
        assert!(is_relevant(Path::new(path)), "{path} should be relevant");
    }
}

#[test]
fn objects_logs_locks_and_noise_are_not_relevant() {
    for path in [
        "objects/ab/cdef",
        "objects/pack/pack-1.idx",
        "logs/HEAD",
        "logs/refs/heads/main",
        "index.lock",
        "HEAD.lock",
        "refs/heads/main.lock",
        "COMMIT_EDITMSG",
        "FETCH_HEAD",
        "ORIG_HEAD",
        "hooks/pre-commit",
        "info/exclude",
        "description",
    ] {
        assert!(!is_relevant(Path::new(path)), "{path} should be ignored");
    }
}

// ---------- debouncing ----------

#[test]
fn a_burst_of_events_gives_one_signal_after_things_go_quiet() {
    let mut debouncer = Debouncer::new(300);
    debouncer.record(0);
    debouncer.record(100);
    debouncer.record(250);
    assert!(!debouncer.take_due(400), "still within 300 ms of the last event");
    assert!(debouncer.take_due(550));
    assert!(!debouncer.take_due(900), "the signal is only given once");
}

#[test]
fn a_late_event_gives_a_second_signal() {
    let mut debouncer = Debouncer::new(300);
    debouncer.record(0);
    assert!(debouncer.take_due(300));
    debouncer.record(1000);
    assert!(!debouncer.take_due(1100));
    assert!(debouncer.take_due(1300));
}

#[test]
fn nothing_recorded_means_nothing_due() {
    let mut debouncer = Debouncer::new(300);
    assert!(!debouncer.take_due(10_000));
}

// ---------- against a real repository ----------

fn git(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["-c", "commit.gpgSign=false"])
        .args(args)
        .output()
        .unwrap();
    assert!(output.status.success(), "{args:?}: {}", String::from_utf8_lossy(&output.stderr));
}

fn repository() -> tempfile::TempDir {
    let dir = tempdir().unwrap();
    git(dir.path(), &["init", "--quiet", "-b", "main"]);
    git(dir.path(), &["config", "user.name", "RustPilot Test"]);
    git(dir.path(), &["config", "user.email", "rustpilot@example.invalid"]);
    fs::write(dir.path().join("a.txt"), "one\n").unwrap();
    git(dir.path(), &["add", "--", "a.txt"]);
    git(dir.path(), &["commit", "--quiet", "-m", "first"]);
    dir
}

fn counter() -> (Arc<AtomicUsize>, Box<dyn Fn() + Send + Sync>) {
    let count = Arc::new(AtomicUsize::new(0));
    let seen = count.clone();
    (count, Box::new(move || void(seen.fetch_add(1, Ordering::SeqCst))))
}

fn void<T>(_: T) {}

fn wait_for(count: &AtomicUsize, at_least: usize, limit: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < limit {
        if count.load(Ordering::SeqCst) >= at_least {
            return true;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    false
}

#[test]
fn a_commit_is_noticed_once_within_a_second() {
    let dir = repository();
    let (count, callback) = counter();
    let _handle = watch(dir.path(), callback).unwrap();
    std::thread::sleep(Duration::from_millis(200));

    fs::write(dir.path().join("a.txt"), "two\n").unwrap();
    git(dir.path(), &["add", "--", "a.txt"]);
    git(dir.path(), &["commit", "--quiet", "-m", "second"]);

    assert!(wait_for(&count, 1, Duration::from_secs(2)), "the commit was not noticed");
    std::thread::sleep(Duration::from_millis(700));
    assert_eq!(count.load(Ordering::SeqCst), 1, "one signal for one burst of changes");
}

#[test]
fn switching_branches_is_noticed() {
    let dir = repository();
    let (count, callback) = counter();
    let _handle = watch(dir.path(), callback).unwrap();
    std::thread::sleep(Duration::from_millis(200));
    git(dir.path(), &["switch", "--quiet", "-c", "feature"]);
    assert!(wait_for(&count, 1, Duration::from_secs(2)));
}

#[test]
fn reading_status_does_not_trigger_anything() {
    let dir = repository();
    let (count, callback) = counter();
    let _handle = watch(dir.path(), callback).unwrap();
    std::thread::sleep(Duration::from_millis(200));
    // The way RustPilot reads: no optional locks, so Git does not refresh (rewrite) the index.
    for _ in 0..3 {
        let output = Command::new("git")
            .env("GIT_OPTIONAL_LOCKS", "0")
            .arg("--no-optional-locks")
            .arg("-C")
            .arg(dir.path())
            .args(["status", "--porcelain=v2", "-z", "--branch"])
            .output()
            .unwrap();
        assert!(output.status.success());
    }
    std::thread::sleep(Duration::from_millis(800));
    assert_eq!(count.load(Ordering::SeqCst), 0);
}

#[test]
fn editing_a_working_file_is_not_a_git_event() {
    let dir = repository();
    let (count, callback) = counter();
    let _handle = watch(dir.path(), callback).unwrap();
    std::thread::sleep(Duration::from_millis(200));
    fs::write(dir.path().join("a.txt"), "changed\n").unwrap();
    std::thread::sleep(Duration::from_millis(800));
    assert_eq!(count.load(Ordering::SeqCst), 0);
}

#[test]
fn dropping_the_handle_stops_the_signals() {
    let dir = repository();
    let (count, callback) = counter();
    let handle = watch(dir.path(), callback).unwrap();
    std::thread::sleep(Duration::from_millis(200));
    drop(handle);
    std::thread::sleep(Duration::from_millis(200));
    git(dir.path(), &["switch", "--quiet", "-c", "after-drop"]);
    std::thread::sleep(Duration::from_millis(900));
    assert_eq!(count.load(Ordering::SeqCst), 0);
}

#[test]
fn a_linked_worktree_is_noticed_through_the_shared_refs() {
    let dir = repository();
    let linked = dir.path().join("linked");
    git(dir.path(), &["worktree", "add", "--quiet", "-b", "wt", linked.to_str().unwrap()]);
    let (count, callback) = counter();
    let _handle = watch(&linked, callback).unwrap();
    std::thread::sleep(Duration::from_millis(200));

    fs::write(linked.join("b.txt"), "x\n").unwrap();
    git(&linked, &["add", "--", "b.txt"]);
    git(&linked, &["commit", "--quiet", "-m", "in worktree"]);
    assert!(wait_for(&count, 1, Duration::from_secs(2)));
}

#[test]
fn watching_a_folder_that_is_not_a_repository_fails_clearly() {
    let dir = tempdir().unwrap();
    let (_count, callback) = counter();
    assert!(watch(dir.path(), callback).is_err());
}
