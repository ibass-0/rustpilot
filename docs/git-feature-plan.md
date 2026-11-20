# Git Feature Plan

## Current progress

- [x] Git CLI repository-status infrastructure and porcelain v2 parser.
- [x] Branch, upstream, ahead/behind, detached HEAD, and structured changes.
- [x] Tauri Git adapter and reactive frontend Git store.
- [x] Read-only Commit panel with grouped changes and a change-count badge.
- [x] Stage and unstage individual files or complete groups.
- [ ] Diff viewer, discard, commit, and amend.
- [ ] History, branches, remotes, merge/rebase, conflicts, and stash workflows.

## VS Code Git parity plan

The next Git implementation target is the built-in Source Control workflow from
VS Code, adapted to RustPilot's multiple-repository workspace model. Each Git
operation must be routed to the repository that owns the selected path.

### Source Control foundation

- Discover every nested repository under the workspace.
- Keep independent state for each repository: root, branch, upstream,
  ahead/behind, changes, conflicts, loading, and errors.
- Display repositories as collapsible sections in the Source Control panel.
- Group files into Changes, Staged Changes, and Merge Changes.
- Add status badges and colors to files and parent directories.
- Refresh manually, after operations, on focus, and through a debounced Git
  filesystem watcher.

### Stage and unstage

- Stage and unstage files, directories, and all changes.
- Support rename-aware and deletion-aware staging.
- Add selected-hunk stage and unstage after the basic workflow is stable.
- Show progress and busy state per repository.

Use argument-array commands with `--` before paths:

```text
git add -- <paths>
git reset --quiet HEAD -- <paths>
```

### Commit workflow

- Add a commit-message textarea to Source Control.
- Validate empty messages and missing staged files.
- Support Commit, Commit & Push, Commit & Sync, and Amend.
- Clear the message after success.
- Surface hook and Git errors as notifications.

Commands:

```text
git commit -m <message>
git commit --amend
```

### Diff workflow

- Clicking a file opens a diff editor.
- Support Working Tree versus `HEAD`, and Staged versus `HEAD`.
- Add side-by-side and unified modes.
- Highlight additions, deletions, and hunks.
- Support new, deleted, renamed, binary, and untracked files.
- Add next/previous hunk navigation.
- Add revert file and selected-hunk actions.

For untracked files, use `git diff --no-index` against the platform null
device (`NUL` on Windows and `/dev/null` elsewhere).

### Discard changes

- Discard a file, directory, all changes, or a selected hunk.
- Distinguish working-tree discard from unstage.
- Require confirmation for destructive actions.

```text
git restore -- <paths>
git restore --staged -- <paths>
git restore --source=HEAD --staged --worktree -- <paths>
```

### History and branches

- Add paginated commit history with graph lanes.
- Show author, date, subject, refs, and changed files.
- Open commit details and compare with parent.
- Add branch picker with search and recent branches.
- Create, checkout, rename, and delete branches.
- Warn before detached HEAD.

```text
git log --format=<machine-readable-format>
git show --format=<machine-readable-format>
git switch <branch>
git switch -c <branch>
```

### Remote operations

- Fetch, pull, push, and Sync Changes.
- Publish a branch and set upstream.
- Show incoming/outgoing counts.
- Stream progress and support cancellation.
- Preserve credential-helper and signing behavior.

```text
git fetch
git pull
git push
git push -u <remote> <branch>
```

### Merge, conflicts, and rebase

- List conflicted files separately.
- Provide a three-way merge editor with Current, Incoming, and Both actions.
- Continue or abort merge and rebase operations.
- Stage resolved files.
- Add stash create, apply, pop, drop, and diff workflows.

```text
git merge <branch>
git merge --continue
git merge --abort
git rebase <branch>
git rebase --continue
git rebase --skip
git rebase --abort
```

### Delivery order

1. Finish nested-repository discovery and repository-root routing.
2. Convert Commit into a per-repository Source Control panel.
3. Add commit message, commit, and amend.
4. Add discard operations.
5. Upgrade the Diff Viewer to side-by-side mode and hunk actions.
6. Add history and the branch picker.
7. Add fetch, pull, push, and sync.
8. Add merge, conflict resolution, rebase, stash, tags, worktrees,
   submodules, LFS, and the full Git watcher.

## Product direction

RustPilot's Git experience will combine the compact, task-oriented workflow of
VS Code with the deeper history and branch tooling of JetBrains IDEs.

- The left-side **Commit** tool window handles day-to-day changes, staging, and
  commits.
- The bottom **Git** tool window handles history, branches, remotes, and
  repository operations.
- The editor displays file decorations, line changes, diffs, and merge
  conflicts in context.

## Target user experience

### Commit tool window

- Group files into Changes, Staged Changes, and Merge Conflicts.
- Stage or unstage one file, a selection, or all files.
- Discard changes after explicit confirmation.
- Enter and validate a commit message.
- Commit, amend, or commit and push.
- Show the number of changed files on the tool-window button.
- Open a working-tree or staged diff by selecting a file.

### Git tool window

- Display commit history as a graph.
- Show commit details and changed files.
- Browse branches, tags, and remotes.
- Create, check out, rename, and delete branches.
- Fetch, pull, and push with progress and cancellation.
- Show upstream, ahead, and behind information.

### Editor integration

- Decorate modified, added, deleted, renamed, and conflicted files.
- Mark changed lines in the editor gutter.
- Open unified or side-by-side diffs.
- Navigate between changes.
- Resolve conflicts with Current, Incoming, and Both actions.

## Architecture

Use the Git executable through the Rust backend instead of reading `.git`
internals directly. This preserves compatibility with the user's Git config,
hooks, credential manager, signing setup, worktrees, and submodules.

Commands must be executed with an argument array and without a command shell so
paths and commit messages cannot be interpreted as shell syntax.

```text
Rust domain
  GitRepository, GitStatus, GitChange, GitCommit, GitBranch

Rust application
  status, stage, unstage, diff, commit, log, branch, fetch, pull, push

Rust infrastructure
  Git CLI process adapter
  porcelain v2 parser
  log and diff parsers

Tauri presentation
  git_status, git_stage, git_commit, git_log, ...
  git://changed and git://progress events

TypeScript infrastructure
  Tauri Git adapter

TypeScript application
  gitStore.ts
  commitStore.ts

Presentation
  CommitPanel
  GitLogPanel
  DiffEditor
  BranchPopup
```

Repository status should use machine-readable, NUL-delimited output:

```text
git status --porcelain=v2 -z --branch
```

## Implementation phases

### Phase 1: repository and status foundation

- Locate the Git executable and report a clear error when unavailable.
- Detect whether the workspace is a repository or worktree.
- Add structured models for repository, branch, upstream, and changes.
- Parse modified, added, deleted, renamed, untracked, and conflicted files.
- Report detached HEAD and ahead/behind state.
- Add a Tauri Git port and frontend `gitStore`.
- Refresh manually, after Git operations, and when the window regains focus.
- Show the active branch and changed-file badge from the Git store.
- Replace direct `.git/HEAD` reading in `workspaceStore`.

Tests must cover normal repositories, non-repositories, detached HEAD, Unicode
and spaced paths, renames, deletes, untracked files, conflicts, worktrees, and
malformed command output.

### Phase 2: commit workflow

- Build the Commit tool-window UI.
- Group Changes, Staged Changes, and Merge Conflicts.
- Stage and unstage individual files or all files.
- Discard changes with confirmation.
- Add commit-message input and validation.
- Support normal commits and amend.
- Open a diff from each change entry.
- Add refresh and commit shortcuts.

Each mutating operation should return or trigger a fresh status snapshot so
the frontend does not have to predict Git's resulting state.

### Phase 3: diff viewer

- Add unified and side-by-side views using CodeMirror.
- Compare working tree with index and index with `HEAD`.
- Support new, deleted, renamed, and binary files.
- Add next/previous-change navigation.
- Add stage and revert actions for selected hunks after read-only diffs are
  stable.

### Phase 4: history and branches

- Load commit history in pages.
- Render graph lanes, refs, author, time, and subject.
- Show commit details and files changed by a commit.
- Compare a commit with its parent.
- Add branch and tag browsing.
- Create, check out, rename, and delete branches.
- Warn before entering detached HEAD.

### Phase 5: remotes

- List and manage repository remotes.
- Fetch, pull, push, and set upstream.
- Stream progress for long-running operations.
- Allow cancellation where the Git process can be stopped safely.
- Use the user's configured credential helper.
- Require strong confirmation for force-with-lease operations.
- Present Git errors with the command context removed or sanitized.

### Phase 6: merge, rebase, conflicts, and stash

- Merge a branch and continue or abort a merge.
- Start, continue, skip, or abort a rebase.
- Display conflicted files separately.
- Add a three-way merge editor.
- Mark resolved files and stage them.
- Create, apply, pop, and drop stashes.

## MVP boundary

The first usable release includes:

1. Repository detection and status.
2. Commit tool window with file groups.
3. Stage and unstage.
4. Read-only working-tree and staged diffs.
5. Discard changes with confirmation.
6. Commit and amend.

Remote operations, rebase, advanced history, hunk staging, and the merge editor
remain outside the initial MVP. They require credential handling, progress,
cancellation, and more extensive conflict-state testing.

## Recommended delivery order

1. Rust Git domain, process port, CLI adapter, and status parser.
2. Tauri commands and integration tests using temporary repositories.
3. TypeScript Git port and `gitStore`.
4. Read-only Commit panel.
5. Stage and unstage operations.
6. Diff viewer.
7. Discard, commit, and amend operations.
8. Commit history and branch operations.
9. Remote operations.
10. Merge, rebase, stash, and conflict tooling.

The suggested first implementation commit is:

```text
feat: add Git repository status infrastructure
```
