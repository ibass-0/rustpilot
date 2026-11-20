import { batch } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { toAppError } from '../domain/fs';
import { emptyGitStatus, type GitStatus } from '../domain/git';
import { ports } from './ports';

export interface GitState {
  root: string | null;
  repositoryRoots: string[];
  loading: boolean;
  status: GitStatus;
  error: string | null;
  busy: boolean;
}

const initial = (): GitState => ({ root: null, repositoryRoots: [], loading: false, status: emptyGitStatus(), error: null, busy: false });
const [state, setState] = createStore<GitState>(initial());
let request = 0;

export const git: GitState = state;

/** Load a repository snapshot. Failures are exposed in state without blocking the workspace. */
export async function loadGit(root: string): Promise<GitStatus> {
  const current = ++request;
  setState({ root, loading: true, error: null });
  try {
    const discovered = await ports().git.repositories(root);
    const repositoryRoots = discovered.length ? discovered : [root];
    const snapshots = await Promise.all(repositoryRoots.map(async (repositoryRoot) => ({ root: repositoryRoot, status: await ports().git.status(repositoryRoot) })));
    const status = snapshots.reduce((combined, snapshot) => {
      if (!combined.isRepository && snapshot.status.isRepository) {
        combined.branch = snapshot.status.branch;
        combined.detached = snapshot.status.detached;
        combined.upstream = snapshot.status.upstream;
        combined.ahead = snapshot.status.ahead;
        combined.behind = snapshot.status.behind;
      }
      combined.isRepository ||= snapshot.status.isRepository;
      const prefix = root.replace(/\\+$/, '').replace(/\/+$/, '');
      const repo = snapshot.root.replace(/\\+$/, '').replace(/\/+$/, '');
      const prefixLower = prefix.toLowerCase();
      const repoLower = repo.toLowerCase();
      const repoPrefix = repoLower.startsWith(`${prefixLower}\\`) || repoLower.startsWith(`${prefixLower}/`)
        ? repo.slice(prefix.length + 1).replace(/\\/g, '/')
        : '';
      combined.changes.push(...snapshot.status.changes.map((change) => ({ ...change, path: repoPrefix ? `${repoPrefix}/${change.path}` : change.path })));
      return combined;
    }, emptyGitStatus());
    if (current === request) {
      batch(() => {
        setState('root', root);
        setState('repositoryRoots', repositoryRoots);
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
        setState('repositoryRoots', []);
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
