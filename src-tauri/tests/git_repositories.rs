use std::fs;
use std::path::Path;
use std::process::Command;

use rustpilot_lib::application::git::{check_git_version, kind_from_git_file, parse_git_version};
use rustpilot_lib::domain::error::ErrorKind;
use rustpilot_lib::domain::git::{RepositoryInfo, RepositoryKind};
use rustpilot_lib::domain::ports::GitRepository;
use rustpilot_lib::infrastructure::git_cli::GitCli;
use tempfile::tempdir;

fn git(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["-c", "protocol.file.allow=always", "-c", "commit.gpgSign=false"])
        .args(args)
        .output()
        .unwrap();
    assert!(output.status.success(), "{args:?}: {}", String::from_utf8_lossy(&output.stderr));
}

fn init(root: &Path) {
    fs::create_dir_all(root).unwrap();
    git(root, &["init", "--quiet"]);
    git(root, &["config", "user.name", "RustPilot Test"]);
    git(root, &["config", "user.email", "rustpilot@example.invalid"]);
}

fn commit_file(root: &Path, name: &str) {
    fs::write(root.join(name), "x\n").unwrap();
    git(root, &["add", "--", name]);
    git(root, &["commit", "--quiet", "-m", "c"]);
}

fn roots(found: &[RepositoryInfo]) -> Vec<String> {
    let mut roots: Vec<String> = found.iter().map(|r| r.root.replace('\\', "/")).collect();
    roots.sort();
    roots
}

fn norm(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

// ---------- version ----------

#[test]
fn parses_git_versions_from_every_platform() {
    assert_eq!(parse_git_version("git version 2.47.1.windows.2"), Some((2, 47, 1)));
    assert_eq!(parse_git_version("git version 2.39.5 (Apple Git-154)\n"), Some((2, 39, 5)));
    assert_eq!(parse_git_version("git version 2.45.0-rc1"), Some((2, 45, 0)));
    assert_eq!(parse_git_version("git version 2.30"), Some((2, 30, 0)));
    assert_eq!(parse_git_version("nonsense"), None);
    assert_eq!(parse_git_version(""), None);
}

#[test]
fn git_older_than_2_30_or_missing_is_refused_with_its_own_error() {
    assert!(check_git_version(Some((2, 30, 0))).is_ok());
    assert!(check_git_version(Some((3, 0, 0))).is_ok());
    assert_eq!(check_git_version(Some((2, 29, 9))).unwrap_err().kind, ErrorKind::GitTooOld);
    assert_eq!(check_git_version(None).unwrap_err().kind, ErrorKind::GitMissing);
}

#[test]
fn the_installed_git_reports_a_usable_version() {
    let text = GitCli.version().unwrap();
    assert!(check_git_version(parse_git_version(&text)).is_ok(), "{text}");
}

// ---------- kinds ----------

#[test]
fn a_git_file_tells_submodules_and_worktrees_apart() {
    assert_eq!(kind_from_git_file("gitdir: ../.git/modules/lib\n"), RepositoryKind::Submodule);
    assert_eq!(kind_from_git_file("gitdir: C:/p/.git/worktrees/feature"), RepositoryKind::Worktree);
    assert_eq!(kind_from_git_file("gitdir: C:\\p\\.git\\modules\\lib"), RepositoryKind::Submodule);
    assert_eq!(kind_from_git_file("gitdir: somewhere/else"), RepositoryKind::Repository);
    assert_eq!(kind_from_git_file("garbage"), RepositoryKind::Repository);
}

// ---------- discovery ----------

#[test]
fn finds_the_root_and_nested_repositories() {
    let dir = tempdir().unwrap();
    init(dir.path());
    init(&dir.path().join("packages/lib"));
    init(&dir.path().join("tools"));
    let found = GitCli.repositories(dir.path()).unwrap();
    assert_eq!(
        roots(&found),
        vec![norm(dir.path()), norm(&dir.path().join("packages/lib")), norm(&dir.path().join("tools"))]
    );
    assert!(found.iter().all(|r| r.kind == RepositoryKind::Repository));
}

#[test]
fn a_folder_that_is_not_a_repository_still_lists_the_ones_inside() {
    let dir = tempdir().unwrap();
    init(&dir.path().join("a"));
    init(&dir.path().join("b/c"));
    let found = GitCli.repositories(dir.path()).unwrap();
    assert_eq!(roots(&found), vec![norm(&dir.path().join("a")), norm(&dir.path().join("b/c"))]);
}

#[test]
fn a_project_inside_a_bigger_repository_finds_that_repository() {
    let dir = tempdir().unwrap();
    init(dir.path());
    let inner = dir.path().join("apps/web");
    fs::create_dir_all(&inner).unwrap();
    let found = GitCli.repositories(&inner).unwrap();
    assert_eq!(roots(&found), vec![norm(dir.path())]);
}

#[test]
fn ignores_dependency_and_build_folders() {
    let dir = tempdir().unwrap();
    init(dir.path());
    for folder in ["node_modules/pkg", "target/debug", "dist/x", "build/y", ".venv/z"] {
        init(&dir.path().join(folder));
    }
    assert_eq!(roots(&GitCli.repositories(dir.path()).unwrap()), vec![norm(dir.path())]);
}

#[test]
fn recognises_submodules() {
    let dir = tempdir().unwrap();
    let library = dir.path().join("library-source");
    init(&library);
    commit_file(&library, "lib.txt");
    let main = dir.path().join("main");
    init(&main);
    commit_file(&main, "a.txt");
    git(&main, &["submodule", "add", "--quiet", &norm(&library), "vendor/lib"]);

    let found = GitCli.repositories(&main).unwrap();
    let submodule = found.iter().find(|r| r.root.replace('\\', "/").ends_with("vendor/lib")).expect("the submodule");
    assert_eq!(submodule.kind, RepositoryKind::Submodule);
    assert_eq!(found.iter().filter(|r| r.kind == RepositoryKind::Repository).count(), 1);
}

#[test]
fn recognises_worktrees() {
    let dir = tempdir().unwrap();
    let main = dir.path().join("main");
    init(&main);
    commit_file(&main, "a.txt");
    let linked = dir.path().join("linked");
    git(&main, &["worktree", "add", "--quiet", "-b", "feature", &norm(&linked)]);

    let found = GitCli.repositories(&linked).unwrap();
    assert_eq!(roots(&found), vec![norm(&linked)]);
    assert_eq!(found[0].kind, RepositoryKind::Worktree);
}

#[test]
fn an_empty_or_missing_folder_has_no_repositories() {
    let dir = tempdir().unwrap();
    assert!(GitCli.repositories(dir.path()).unwrap().is_empty());
    assert!(GitCli.repositories(&dir.path().join("missing")).is_err());
}

#[test]
fn discovery_stops_at_a_sensible_depth() {
    let dir = tempdir().unwrap();
    let deep = dir.path().join("a/b/c/d/e/f/g/h/i/j");
    init(&deep);
    assert!(GitCli.repositories(dir.path()).unwrap().is_empty());
}
