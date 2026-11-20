import { batch } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { toAppError } from '../domain/fs';
import { emptyGitStatus, type GitStatus } from '../domain/git';
import { ports } from './ports';

export interface GitState {
  root: string | null;
  loading: boolean;
  status: GitStatus;
  error: string | null;
  busy: boolean;
}

const initial = (): GitState => ({ root: null, loading: false, status: emptyGitStatus(), error: null, busy: false });
const [state, setState] = createStore<GitState>(initial());
let request = 0;

export const git: GitState = state;

/** Load a repository snapshot. Failures are exposed in state without blocking the workspace. */
export async function loadGit(root: string): Promise<GitStatus> {
  const current = ++request;
  setState({ root, loading: true, error: null });
  try {
    const status = await ports().git.status(root);
    if (current === request) {
      batch(() => {
        setState('root', root);
        setState('loading', false);
        setState('status', reconcile(status));
        setState('error', null);
      });
    }
    return status;
  } catch (err) {
    if (current === request) {
      batch(() => {
        setState('root', root);
        setState('loading', false);
        setState('status', reconcile(emptyGitStatus()));
        setState('error', toAppError(err).message);
      });
    }
    return emptyGitStatus();
  }
}

export async function refreshGit(): Promise<void> {
  if (state.root !== null) await loadGit(state.root);
}

async function mutate(operation: (root: string) => Promise<GitStatus>): Promise<void> {
  const root = state.root;
  if (root === null || state.busy) return;
  const current = ++request;
  setState({ busy: true, error: null });
  try {
    const status = await operation(root);
    if (current === request) setState('status', reconcile(status));
  } catch (err) {
    if (current === request) setState('error', toAppError(err).message);
  } finally {
    if (current === request) setState('busy', false);
  }
}

export const stagePaths = (paths: string[]): Promise<void> => mutate((root) => ports().git.stage(root, paths));
export const unstagePaths = (paths: string[]): Promise<void> => mutate((root) => ports().git.unstage(root, paths));

export function closeGit(): void {
  request++;
  setState(reconcile(initial()));
}
