import type { GitChange } from './git';

export interface ChangeGroups {
  conflicts: GitChange[];
  staged: GitChange[];
  /** Tracked files changed in the working tree. */
  working: GitChange[];
  untracked: GitChange[];
}

/** Sort the changes of a repository into the groups the Commit panel shows. */
export function groupChanges(changes: readonly GitChange[]): ChangeGroups {
  const groups: ChangeGroups = { conflicts: [], staged: [], working: [], untracked: [] };
  for (const change of changes) {
    if (change.kind === 'conflicted') groups.conflicts.push(change);
    else if (change.staged) groups.staged.push(change);
    else if (change.kind === 'untracked') groups.untracked.push(change);
    else groups.working.push(change);
  }
  return groups;
}

/** The message to show when a commit cannot be made, or `null` when it can. */
export function validateCommit(message: string, options: { amend: boolean; stagedCount: number }): string | null {
  if (message.trim() === '') return 'Enter a commit message.';
  if (!options.amend && options.stagedCount === 0) return 'There is nothing staged to commit.';
  return null;
}

/** Put `message` first in the list of earlier messages: no blanks, no repeats, at most `limit`. */
export function rememberMessage(history: readonly string[], message: string, limit: number): string[] {
  const trimmed = message.trim();
  if (trimmed === '') return [...history];
  return [trimmed, ...history.filter((item) => item !== trimmed)].slice(0, limit);
}

/**
 * Where to go in the message history: `-1` is the draft being typed, `0` the newest earlier
 * message. Going older stops at the oldest; going newer ends back at the draft.
 */
export function nextHistoryIndex(current: number, length: number, direction: 'older' | 'newer'): number {
  if (length === 0) return -1;
  if (direction === 'older') return Math.min(current + 1, length - 1);
  return Math.max(current - 1, -1);
}

export interface ChangeTreeNode {
  /** What the row shows: a file name, or a folder path such as `packages/ui/src`. */
  name: string;
  /** The folder path (relative to the repository) for folders; the file path for files. */
  path: string;
  /** For files, their change; for folders `null`. */
  change: GitChange | null;
  /** Every change at or below this node. */
  changes: GitChange[];
  count: number;
  children: ChangeTreeNode[];
}

interface Folder {
  folders: Map<string, Folder>;
  files: GitChange[];
}

const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });

function everythingIn(folder: Folder): GitChange[] {
  return [...folder.files, ...[...folder.folders.values()].flatMap(everythingIn)];
}

function toNodes(folder: Folder, prefix: string): ChangeTreeNode[] {
  const folders = [...folder.folders.entries()].sort(([a], [b]) => byName(a, b));
  const nodes: ChangeTreeNode[] = folders.map(([name, child]) => {
    // A folder whose only content is one other folder is shown together with it: `packages/ui/src`.
    let label = name;
    let current = child;
    while (current.files.length === 0 && current.folders.size === 1) {
      const [nextName, next] = [...current.folders.entries()][0];
      label = `${label}/${nextName}`;
      current = next;
    }
    const path = prefix ? `${prefix}/${label}` : label;
    const changes = everythingIn(current);
    return { name: label, path, change: null, changes, count: changes.length, children: toNodes(current, path) };
  });
  const files = [...folder.files].sort((a, b) => byName(a.path.split('/').pop() ?? a.path, b.path.split('/').pop() ?? b.path));
  for (const change of files) {
    nodes.push({ name: change.path.split('/').pop() ?? change.path, path: change.path, change, changes: [change], count: 1, children: [] });
  }
  return nodes;
}

/** Arrange changes by folder, for the tree view: folders first, then files, long single-child chains merged. */
export function buildChangeTree(changes: readonly GitChange[]): ChangeTreeNode[] {
  const root: Folder = { folders: new Map(), files: [] };
  for (const change of changes) {
    const parts = change.path.split('/');
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      let next = folder.folders.get(part);
      if (!next) {
        next = { folders: new Map(), files: [] };
        folder.folders.set(part, next);
      }
      folder = next;
    }
    folder.files.push(change);
  }
  return toNodes(root, '');
}
