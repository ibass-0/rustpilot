import { createStore } from 'solid-js/store';
import { hunkPatch, parseDiff, type DiffFile } from '../domain/diff';
import { toAppError } from '../domain/fs';
import type { FileVersions } from '../domain/git';
import { applyHunkInRepository, git } from './gitStore';
import { repositoryKey } from '../domain/git';
import { ports } from './ports';

const MODE_KEY = 'rustpilot.git.diffMode';

export type DiffMode = 'unified' | 'split';

export interface DiffState {
  root: string | null;
  path: string | null;
  staged: boolean;
  text: string;
  /** `text` split into files and hunks. */
  files: DiffFile[];
  /** The hunk that Next/Previous change navigation is on. */
  hunkIndex: number;
  mode: DiffMode;
  /** Both sides of the file, loaded for the side-by-side view. */
  versions: FileVersions | null;
  versionsError: string | null;
  loading: boolean;
  error: string | null;
}

const initial = (): Omit<DiffState, 'mode'> => ({
  root: null,
  path: null,
  staged: false,
  text: '',
  files: [],
  hunkIndex: 0,
  versions: null,
  versionsError: null,
  loading: false,
  error: null,
});

const [state, setState] = createStore<DiffState>({ ...initial(), mode: 'unified' });
export const diff: DiffState = state;
let request = 0;

export function loadDiffPrefs(): void {
  setState('mode', ports().storage.get(MODE_KEY) === 'split' ? 'split' : 'unified');
}

async function loadVersions(root: string, path: string, staged: boolean, current: number): Promise<void> {
  try {
    const versions = await ports().git.fileVersions(root, path, staged);
    if (current === request) setState({ versions, versionsError: null });
  } catch (err) {
    if (current === request) setState({ versions: null, versionsError: toAppError(err).message });
  }
}

/** Switch between the unified diff and the side-by-side view; the choice is remembered. */
export function setDiffMode(mode: DiffMode): void {
  setState('mode', mode);
  ports().storage.set(MODE_KEY, mode);
  if (mode === 'split' && state.path && state.root && state.versions === null && state.versionsError === null) {
    void loadVersions(state.root, state.path, state.staged, request);
  }
}

export async function openDiff(root: string, path: string, staged = false): Promise<void> {
  const current = ++request;
  setState({ ...initial(), root, path, staged, loading: true });
  try {
    const text = await ports().git.diff(root, path, staged);
    if (current !== request) return;
    setState({ text, files: parseDiff(text), loading: false });
    if (state.mode === 'split') await loadVersions(root, path, staged, current);
  } catch (err) {
    if (current === request) setState({ loading: false, error: toAppError(err).message });
  }
}

export function closeDiff(): void {
  request++;
  setState({ ...initial() });
}

/** Move to the next (`1`) or previous (`-1`) hunk of the file. */
export function stepHunk(direction: 1 | -1): void {
  const count = state.files[0]?.hunks.length ?? 0;
  if (count === 0) return;
  setState('hunkIndex', Math.min(count - 1, Math.max(0, state.hunkIndex + direction)));
}

/**
 * Stage, unstage or discard one hunk of the open file, then read the diff again. Discarding asks
 * first because it cannot be undone.
 */
export async function applyHunkAction(index: number, action: 'stage' | 'unstage' | 'discard'): Promise<void> {
  const { root, path, staged } = state;
  const file = state.files[0];
  if (!root || !path || !file) return;
  const patch = hunkPatch(file, index);
  if (patch === null) return;
  if (action === 'discard' && !(await ports().dialog.confirm('Discard this change? This cannot be undone.'))) return;
  const done = await applyHunkInRepository(root, patch, action);
  if (!done) {
    setState('error', git.repositories[repositoryKey(root)]?.error ?? 'The change could not be applied.');
    return;
  }
  if (state.path === path && state.root === root) await openDiff(root, path, staged);
}
