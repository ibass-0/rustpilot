import { batch } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { toAppError, type DirEntry } from '../domain/fs';
import { closeGit, loadGit } from './gitStore';
import { ports } from './ports';

export interface WorkspaceState {
  root: string | null;
  /** Loaded directory listings, keyed by directory path. */
  children: Record<string, DirEntry[]>;
  expanded: Record<string, boolean>;
  /** The checked-out git branch of the root, or `null` when it is not a repository. */
  branch: string | null;
}

const STORAGE_KEY = 'rustpilot.workspace.v1';

const emptyState = (): WorkspaceState => ({ root: null, children: {}, expanded: {}, branch: null });

const [state, setState] = createStore<WorkspaceState>(emptyState());

/** Read-only view of the open workspace. */
export const workspace: WorkspaceState = state;

/** Counts open requests so that only the most recent one takes effect. */
let openRequest = 0;

/**
 * Open `path` as the workspace root. Rejects, leaving the current workspace
 * untouched, if it cannot be listed. When several opens overlap, the one
 * requested last wins no matter which listing finishes first.
 */
export async function openWorkspace(path: string): Promise<void> {
  const request = ++openRequest;
  const entries = await ports().fs.listDir(path);
  const branch = (await loadGit(path)).branch;
  if (request !== openRequest) return;
  setState(reconcile({ root: path, children: { [path]: entries }, expanded: {}, branch }));
  ports().storage.set(STORAGE_KEY, path);
}

export function closeWorkspace(): void {
  openRequest++;
  closeGit();
  setState(reconcile(emptyState()));
  ports().storage.remove(STORAGE_KEY);
}

/**
 * Expand or collapse a directory. Its children are read again on every
 * expand, so files created outside the app show up.
 */
export async function toggleDir(path: string): Promise<void> {
  if (state.expanded[path]) {
    setState('expanded', path, false);
    return;
  }
  try {
    const entries = await ports().fs.listDir(path);
    setState('children', path, entries);
  } catch (err) {
    await ports().dialog.showError(toAppError(err).message);
    return;
  }
  setState('expanded', path, true);
}

/** Collapse every directory in the tree. */
export function collapseAll(): void {
  setState('expanded', reconcile({}));
}

export async function refreshDir(path: string): Promise<void> {
  try {
    const entries = await ports().fs.listDir(path);
    setState('children', path, entries);
  } catch (err) {
    await ports().dialog.showError(toAppError(err).message);
  }
}

/**
 * Re-read the root and every expanded directory, quietly. A directory that can
 * no longer be listed is collapsed and forgotten rather than reported.
 */
export async function refreshWorkspace(): Promise<void> {
  const root = state.root;
  if (root === null) return;
  const request = openRequest;
  const paths = [root, ...Object.keys(state.expanded).filter((path) => state.expanded[path])];
  const listings = await Promise.all(
    paths.map((path) =>
      ports()
        .fs.listDir(path)
        .then(
          (entries) => ({ path, entries }),
          () => ({ path, entries: null }),
        ),
    ),
  );
  const branch = (await loadGit(root)).branch;
  // The workspace was switched while the listings were in flight.
  if (request !== openRequest) return;

  batch(() => {
    setState('branch', branch);
    for (const { path, entries } of listings) {
      if (entries) {
        setState('children', path, reconcile(entries, { key: 'path' }));
      } else if (path !== root) {
        setState('expanded', path, false);
        setState('children', path, undefined!);
      }
    }
  });
}

/** Reopen the last workspace. A folder that no longer opens is forgotten silently. */
export async function restoreWorkspace(): Promise<void> {
  const last = ports().storage.get(STORAGE_KEY);
  if (!last) return;
  const request = openRequest + 1;
  try {
    await openWorkspace(last);
  } catch {
    // Only forget the folder if nothing else was opened while this was failing.
    if (request === openRequest) closeWorkspace();
  }
}

export async function pickAndOpenWorkspace(): Promise<void> {
  const picked = await ports().dialog.pickFolder();
  if (picked === null) return;
  try {
    await openWorkspace(picked);
  } catch (err) {
    await ports().dialog.showError(toAppError(err).message);
  }
}
