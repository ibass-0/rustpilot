use std::fs;
use std::path::Path;
use std::process::Command;

use rustpilot_lib::application::git_log::{
    LogRequest, Scope, commit_details, commit_file_diff, compare_files, list_refs, log, parse_refs,
};
use rustpilot_lib::domain::git_graph::{RefKind, RefLabel};
use rustpilot_lib::infrastructure::git_cli::GitCli;
use tempfile::{TempDir, tempdir};

fn git(root: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["-c", "commit.gpgSign=false", "-c", "core.autocrlf=false", "-c", "tag.gpgSign=false"])
        .args(args)
        .output()
        .unwrap();
    assert!(output.status.success(), "{args:?}: {}", String::from_utf8_lossy(&output.stderr));
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn write(root: &Path, name: &str, text: &str) {
    let path = root.join(name);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, text).unwrap();
}

fn commit(root: &Path, file: &str, text: &str, message: &str) -> String {
    write(root, file, text);
    git(root, &["add", "-A"]);
    git(root, &["commit", "--quiet", "-m", message]);
    git(root, &["rev-parse", "HEAD"])
}

/// main: base -- m1 -- merge;  feature: base -- f1 (merged into main), tag v1 on base.
fn history() -> (TempDir, Vec<String>) {
    let dir = tempdir().unwrap();
    let r = dir.path();
    git(r, &["init", "--quiet", "-b", "main"]);
    git(r, &["config", "user.name", "Ann Author"]);
    git(r, &["config", "user.email", "ann@example.invalid"]);
    let base = commit(r, "a.txt", "one\n", "base");
    git(r, &["tag", "v1"]);
    git(r, &["switch", "--quiet", "-c", "feature"]);
    let f1 = commit(r, "feature.txt", "feature\n", "feature work");
    git(r, &["switch", "--quiet", "main"]);
    let m1 = commit(r, "a.txt", "one\ntwo\n", "main work");
    git(r, &["merge", "--no-ff", "--quiet", "-m", "merge feature", "feature"]);
    let merge = git(r, &["rev-parse", "HEAD"]);
    (dir, vec![base, f1, m1, merge])
}

fn request() -> LogRequest {
    LogRequest { limit: 100, ..LogRequest::default() }
}

#[test]
fn the_log_lists_commits_newest_first_with_their_parents() {
    let (dir, hashes) = history();
    let page = log(&GitCli, dir.path(), &request()).unwrap();
    let subjects: Vec<_> = page.commits.iter().map(|c| c.commit.subject.as_str()).collect();
    assert_eq!(subjects[0], "merge feature");
    assert_eq!(subjects.last(), Some(&"base"));
    assert_eq!(page.commits.len(), 4);
    let merge = &page.commits[0].commit;
    assert_eq!(merge.hash, hashes[3]);
    assert_eq!(merge.parents.len(), 2);
    assert_eq!(merge.author, "Ann Author");
    assert_eq!(merge.email, "ann@example.invalid");
    assert!(merge.timestamp > 1_600_000_000);
}

#[test]
fn the_graph_of_a_merge_uses_two_lanes_and_children_come_before_parents() {
    let (dir, _) = history();
    let page = log(&GitCli, dir.path(), &request()).unwrap();
    let rows: Vec<_> = page.commits.iter().map(|c| c.graph.as_ref().expect("a graph")).collect();
    assert_eq!(rows[0].outgoing.len(), 2);
    assert!(rows.iter().map(|r| r.column).max().unwrap() >= 1);
    let position = |subject: &str| page.commits.iter().position(|c| c.commit.subject == subject).unwrap();
    assert!(position("merge feature") < position("main work"));
    assert!(position("main work") < position("base"));
    assert!(position("feature work") < position("base"));
}

#[test]
fn branches_tags_and_head_are_labelled() {
    let (dir, _) = history();
    let page = log(&GitCli, dir.path(), &request()).unwrap();
    let merge_refs = &page.commits[0].commit.refs;
    assert!(merge_refs.iter().any(|r| r.name == "main" && r.kind == RefKind::Branch && r.current), "{merge_refs:?}");
    assert!(merge_refs.iter().any(|r| r.kind == RefKind::Head));
    let base = page.commits.iter().find(|c| c.commit.subject == "base").unwrap();
    assert!(base.commit.refs.iter().any(|r| r.name == "v1" && r.kind == RefKind::Tag));
    let feature = page.commits.iter().find(|c| c.commit.subject == "feature work").unwrap();
    assert!(feature.commit.refs.iter().any(|r| r.name == "feature" && r.kind == RefKind::Branch && !r.current));
}

#[test]
fn decorations_are_parsed_from_git_output() {
    let refs = parse_refs("HEAD -> refs/heads/main, refs/remotes/origin/main, refs/remotes/origin/HEAD, tag: refs/tags/v1.0, refs/heads/feature/x, refs/stash");
    assert!(refs.contains(&RefLabel { name: "main".into(), kind: RefKind::Branch, current: true }));
    assert!(refs.iter().any(|r| r.kind == RefKind::Head));
    assert!(refs.contains(&RefLabel { name: "origin/main".into(), kind: RefKind::Remote, current: false }));
    assert!(refs.contains(&RefLabel { name: "v1.0".into(), kind: RefKind::Tag, current: false }));
    assert!(refs.contains(&RefLabel { name: "feature/x".into(), kind: RefKind::Branch, current: false }));
    assert!(refs.iter().any(|r| r.kind == RefKind::Stash));
    assert!(parse_refs("").is_empty());
}

#[test]
fn a_detached_head_is_marked_without_a_current_branch() {
    let refs = parse_refs("HEAD, tag: refs/tags/v2");
    assert!(refs.iter().any(|r| r.kind == RefKind::Head));
    assert!(!refs.iter().any(|r| r.current));
}

#[test]
fn pages_continue_where_the_last_one_ended_and_say_when_there_is_more() {
    let (dir, _) = history();
    let first = log(&GitCli, dir.path(), &LogRequest { limit: 2, ..LogRequest::default() }).unwrap();
    assert_eq!(first.commits.len(), 2);
    assert!(first.has_more);
    let second = log(
        &GitCli,
        dir.path(),
        &LogRequest { limit: 2, skip: 2, lane_state: first.lane_state.clone(), ..LogRequest::default() },
    )
    .unwrap();
    assert_eq!(second.commits.len(), 2);
    assert!(!second.has_more);
    let whole = log(&GitCli, dir.path(), &request()).unwrap();
    let joined: Vec<_> = first.commits.iter().chain(&second.commits).map(|c| (&c.commit.hash, &c.graph)).collect();
    let expected: Vec<_> = whole.commits.iter().map(|c| (&c.commit.hash, &c.graph)).collect();
    assert_eq!(joined, expected, "paging gives the same graph as one big page");
}

#[test]
fn the_current_branch_only_hides_commits_that_are_not_reachable() {
    let (dir, _) = history();
    git(dir.path(), &["switch", "--quiet", "-c", "side", "v1"]);
    commit(dir.path(), "side.txt", "x\n", "side only");
    git(dir.path(), &["switch", "--quiet", "main"]);
    let all = log(&GitCli, dir.path(), &request()).unwrap();
    assert!(all.commits.iter().any(|c| c.commit.subject == "side only"));
    let head = log(&GitCli, dir.path(), &LogRequest { scope: Scope::Head, ..request() }).unwrap();
    assert!(!head.commits.iter().any(|c| c.commit.subject == "side only"));
}

#[test]
fn chosen_branches_limit_the_log() {
    let (dir, _) = history();
    let page = log(&GitCli, dir.path(), &LogRequest { scope: Scope::Refs(vec!["feature".into()]), ..request() }).unwrap();
    let subjects: Vec<_> = page.commits.iter().map(|c| c.commit.subject.as_str()).collect();
    assert_eq!(subjects, vec!["feature work", "base"]);
}

#[test]
fn a_ref_name_that_looks_like_an_option_is_refused() {
    let (dir, _) = history();
    for bad in ["--all", "-p", "a b", "x;rm", "..", ""] {
        let result = log(&GitCli, dir.path(), &LogRequest { scope: Scope::Refs(vec![bad.into()]), ..request() });
        assert!(result.is_err(), "{bad:?} should be refused");
    }
}

#[test]
fn searching_filters_by_message_author_and_path_and_drops_the_graph() {
    let (dir, _) = history();
    let r = dir.path();
    let by_text = log(&GitCli, r, &LogRequest { search: Some("feature".into()), ..request() }).unwrap();
    assert!(by_text.commits.iter().all(|c| c.commit.subject.contains("feature")));
    assert!(by_text.commits.iter().all(|c| c.graph.is_none()), "a filtered list is flat");

    let by_author = log(&GitCli, r, &LogRequest { author: Some("Nobody".into()), ..request() }).unwrap();
    assert!(by_author.commits.is_empty());
    let by_author = log(&GitCli, r, &LogRequest { author: Some("Ann".into()), ..request() }).unwrap();
    assert_eq!(by_author.commits.len(), 4);

    let by_path = log(&GitCli, r, &LogRequest { path: Some("feature.txt".into()), ..request() }).unwrap();
    assert_eq!(by_path.commits.len(), 1);
    assert_eq!(by_path.commits[0].commit.subject, "feature work");
}

#[test]
fn search_text_that_looks_like_an_option_is_just_text() {
    let (dir, _) = history();
    let page = log(&GitCli, dir.path(), &LogRequest { search: Some("--all".into()), ..request() }).unwrap();
    assert!(page.commits.is_empty());
}

#[test]
fn unsafe_paths_are_refused() {
    let (dir, _) = history();
    assert!(log(&GitCli, dir.path(), &LogRequest { path: Some("../x".into()), ..request() }).is_err());
}

#[test]
fn a_repository_without_commits_has_an_empty_log() {
    let dir = tempdir().unwrap();
    git(dir.path(), &["init", "--quiet", "-b", "main"]);
    let page = log(&GitCli, dir.path(), &request()).unwrap();
    assert!(page.commits.is_empty());
    assert!(!page.has_more);
}

#[test]
fn a_date_range_filters_commits() {
    let (dir, _) = history();
    let none = log(&GitCli, dir.path(), &LogRequest { until: Some("2001-01-01".into()), ..request() }).unwrap();
    assert!(none.commits.is_empty());
    let all = log(&GitCli, dir.path(), &LogRequest { since: Some("2001-01-01".into()), ..request() }).unwrap();
    assert_eq!(all.commits.len(), 4);
}

// ---------- details ----------

#[test]
fn details_give_the_whole_message_and_the_changed_files() {
    let dir = tempdir().unwrap();
    let r = dir.path();
    git(r, &["init", "--quiet", "-b", "main"]);
    git(r, &["config", "user.name", "Ann Author"]);
    git(r, &["config", "user.email", "ann@example.invalid"]);
    commit(r, "keep.txt", "1\n2\n3\n", "first");
    write(r, "keep.txt", "1\n2\nthree\nfour\n");
    write(r, "new.txt", "hello\n");
    git(r, &["add", "-A"]);
    git(r, &["commit", "--quiet", "-m", "second subject\n\nA longer body\nwith two lines"]);
    let hash = git(r, &["rev-parse", "HEAD"]);

    let details = commit_details(&GitCli, r, &hash).unwrap();
    assert_eq!(details.message, "second subject\n\nA longer body\nwith two lines");
    assert_eq!(details.author, "Ann Author");
    assert_eq!(details.parents.len(), 1);
    let keep = details.files.iter().find(|f| f.path == "keep.txt").unwrap();
    assert_eq!((keep.status.as_str(), keep.insertions, keep.deletions), ("M", Some(2), Some(1)));
    let added = details.files.iter().find(|f| f.path == "new.txt").unwrap();
    assert_eq!((added.status.as_str(), added.insertions, added.deletions), ("A", Some(1), Some(0)));
}

#[test]
fn renames_keep_the_old_path() {
    let dir = tempdir().unwrap();
    let r = dir.path();
    git(r, &["init", "--quiet", "-b", "main"]);
    git(r, &["config", "user.name", "A"]);
    git(r, &["config", "user.email", "a@example.invalid"]);
    commit(r, "old name.txt", "same content\nline\nline\nline\n", "first");
    git(r, &["mv", "old name.txt", "new name.txt"]);
    git(r, &["commit", "--quiet", "-m", "rename"]);
    let hash = git(r, &["rev-parse", "HEAD"]);
    let details = commit_details(&GitCli, r, &hash).unwrap();
    assert_eq!(details.files.len(), 1);
    assert_eq!(details.files[0].status, "R");
    assert_eq!(details.files[0].path, "new name.txt");
    assert_eq!(details.files[0].old_path.as_deref(), Some("old name.txt"));
}

#[test]
fn binary_files_have_no_line_counts() {
    let dir = tempdir().unwrap();
    let r = dir.path();
    git(r, &["init", "--quiet", "-b", "main"]);
    git(r, &["config", "user.name", "A"]);
    git(r, &["config", "user.email", "a@example.invalid"]);
    fs::write(r.join("b.bin"), [0u8, 1, 2, 3, 0, 255]).unwrap();
    git(r, &["add", "-A"]);
    git(r, &["commit", "--quiet", "-m", "bin"]);
    let hash = git(r, &["rev-parse", "HEAD"]);
    let details = commit_details(&GitCli, r, &hash).unwrap();
    assert_eq!((details.files[0].insertions, details.files[0].deletions), (None, None));
}

#[test]
fn a_merge_commit_shows_its_changes_against_the_first_parent() {
    let (dir, hashes) = history();
    let details = commit_details(&GitCli, dir.path(), &hashes[3]).unwrap();
    assert!(details.files.iter().any(|f| f.path == "feature.txt"));
    assert_eq!(details.parents.len(), 2);
}

#[test]
fn the_diff_of_one_file_in_a_commit() {
    let (dir, hashes) = history();
    let text = commit_file_diff(&GitCli, dir.path(), &hashes[2], "a.txt").unwrap();
    assert!(text.contains("+two"), "{text}");
    assert!(!text.contains("feature"));
}

#[test]
fn the_first_commit_can_be_shown_too() {
    let (dir, hashes) = history();
    let text = commit_file_diff(&GitCli, dir.path(), &hashes[0], "a.txt").unwrap();
    assert!(text.contains("+one"));
}

#[test]
fn comparing_two_commits_lists_what_differs() {
    let (dir, hashes) = history();
    let files = compare_files(&GitCli, dir.path(), &hashes[0], &hashes[3]).unwrap();
    let paths: Vec<_> = files.iter().map(|f| f.path.as_str()).collect();
    assert!(paths.contains(&"feature.txt") && paths.contains(&"a.txt"), "{paths:?}");
}

#[test]
fn revisions_must_look_like_hashes_or_refs() {
    let (dir, _) = history();
    for bad in ["--output=x", "-p", "abc def", "HEAD;ls", ""] {
        assert!(commit_details(&GitCli, dir.path(), bad).is_err(), "{bad:?}");
    }
    assert!(commit_details(&GitCli, dir.path(), "HEAD").is_ok());
    assert!(commit_details(&GitCli, dir.path(), "v1").is_ok());
}

// ---------- refs ----------

#[test]
fn the_refs_list_has_branches_tags_and_the_current_one() {
    let (dir, hashes) = history();
    let refs = list_refs(&GitCli, dir.path()).unwrap();
    let main = refs.iter().find(|r| r.name == "main").unwrap();
    assert_eq!(main.kind, RefKind::Branch);
    assert!(main.current);
    assert_eq!(main.hash, hashes[3]);
    assert!(refs.iter().any(|r| r.name == "feature" && !r.current));
    assert!(refs.iter().any(|r| r.name == "v1" && r.kind == RefKind::Tag));
}
