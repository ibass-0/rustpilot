import { createStore, reconcile } from 'solid-js/store';
import { toAppError, type DirEntry } from '../domain/fs';
import { ports } from './ports';

export interface WorkspaceState {
  root: string | null;
  /** Loaded directory listings, keyed by directory path. */
  children: Record<string, DirEntry[]>;
  expanded: Record<string, boolean>;
}

const STORAGE_KEY = 'rustpilot.workspace.v1';

const emptyState = (): WorkspaceState => ({ root: null, children: {}, expanded: {} });

const [state, setState] = createStore<WorkspaceState>(emptyState());

/** Read-only view of the open workspace. */
export const workspace: WorkspaceState = state;

/** Open `path` as the workspace root. Rejects, leaving the current workspace untouched, if it cannot be listed. */
export async function openWorkspace(path: string): Promise<void> {
  const entries = await ports().fs.listDir(path);
  setState(reconcile({ root: path, children: { [path]: entries }, expanded: {} }));
  ports().storage.set(STORAGE_KEY, path);
}

export function closeWorkspace(): void {
  setState(reconcile(emptyState()));
  ports().storage.remove(STORAGE_KEY);
}

/** Expand or collapse a directory, loading its children the first time it opens. */
export async function toggleDir(path: string): Promise<void> {
  if (state.expanded[path]) {
    setState('expanded', path, false);
    return;
  }
  if (!state.children[path]) {
    try {
      const entries = await ports().fs.listDir(path);
      setState('children', path, entries);
    } catch (err) {
      await ports().dialog.showError(toAppError(err).message);
      return;
    }
  }
  setState('expanded', path, true);
}

export async function refreshDir(path: string): Promise<void> {
  try {
    const entries = await ports().fs.listDir(path);
    setState('children', path, entries);
  } catch (err) {
    await ports().dialog.showError(toAppError(err).message);
  }
}

/** Reopen the last workspace. A folder that no longer opens is forgotten silently. */
export async function restoreWorkspace(): Promise<void> {
  const last = ports().storage.get(STORAGE_KEY);
  if (!last) return;
  try {
    await openWorkspace(last);
  } catch {
    closeWorkspace();
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
