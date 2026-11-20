import { batch } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import { toAppError } from '../domain/fs';
import {
  emptyGitStatus,
  relativeToRepository,
  repositoryFor,
  repositoryKey,
  type GitChange,
  type GitStatus,
  type RepositoryInfo,
} from '../domain/git';
import { isInside, normalizePath, samePath, type Project } from '../domain/workspace';
import { ports } from './ports';

/** Everything known about one repository. Each has its own state, so one slow or broken repository never affects another. */
export interface RepositoryState extends RepositoryInfo {
  status: GitStatus;
  loading: boolean;
  /** A Git operation (stage, commit, …) is running here. */
  busy: boolean;
  error: string | null;
}

export interface GitState {
  /** `null` until Git has been checked. */
  available: boolean | null;
  /** Why Git cannot be used (missing or too old), shown once instead of an error per action. */
  problem: string | null;
  /** Keyed by `repositoryKey(root)`. */
  repositories: Record<string, RepositoryState>;
  /** Keys in display order: by project, then by path. */
  order: string[];
}

const initial = (): GitState => ({ available: null, problem: null, repositories: {}, order: [] });
const [state, setState] = createStore<GitState>(initial());

/** Read-only view of every repository in the workspace. */
export const git: GitState = state;

/** Per repository, so only the newest reply of that repository is used. */
const requests = new Map<string, number>();
/** The repository keys each project contributes; a repository inside two projects is kept until both are gone. */
const projectRepositories = new Map<string, string[]>();
/** Repositories that changed on disk while an operation was running; they are read when it ends. */
const pending = new Set<string>();
let checking: Promise<void> | null = null;

function recomputeOrder(): void {
  const order: string[] = [];
  for (const keys of projectRepositories.values()) {
    for (const key of keys) if (!order.includes(key)) order.push(key);
  }
  setState('order', order);
}

const referenced = (key: string): boolean => [...projectRepositories.values()].some((keys) => keys.includes(key));

function dropRepository(key: string): void {
  const repository = state.repositories[key];
  if (!repository) return;
  void ports().git.unwatch(repository.root).catch(() => undefined);
  requests.delete(key);
  pending.delete(key);
  setState(
    produce((s) => {
      delete s.repositories[key];
    }),
  );
}

/** Check once that Git is installed and recent enough. */
export function checkGit(): Promise<void> {
  checking ??= (async () => {
    try {
      await ports().git.version();
      setState({ available: true, problem: null });
    } catch (err) {
      setState({ available: false, problem: toAppError(err).message });
    }
  })();
  return checking;
}

/** Find the repositories of a project, read their status in parallel and start watching them. */
export async function loadProject(project: Project): Promise<void> {
  await checkGit();
  if (!state.available) return;
  let found: RepositoryInfo[] = [];
  try {
    found = await ports().git.repositories(project.root);
  } catch {
    found = [];
  }
  const projectKey = repositoryKey(project.root);
  const keys = found.map((repository) => repositoryKey(repository.root));
  const previous = projectRepositories.get(projectKey) ?? [];
  projectRepositories.set(projectKey, keys);

  const added: RepositoryInfo[] = [];
  batch(() => {
    found.forEach((repository, index) => {
      const key = keys[index];
      if (state.repositories[key]) {
        setState('repositories', key, { root: repository.root, kind: repository.kind });
      } else {
        setState('repositories', key, { ...repository, status: emptyGitStatus(), loading: true, busy: false, error: null });
        added.push(repository);
      }
    });
    for (const key of previous) if (!keys.includes(key) && !referenced(key)) dropRepository(key);
    recomputeOrder();
  });
  for (const repository of added) {
    const key = repositoryKey(repository.root);
    void ports()
      .git.watch(repository.root, () => onGitChanged(key))
      .catch(() => undefined);
  }
  await Promise.all(keys.map(refreshRepository));
}

/** Forget a project: its repositories are dropped and unwatched unless another project still holds them. */
export function removeProject(root: string): void {
  const projectKey = repositoryKey(root);
  const keys = projectRepositories.get(projectKey) ?? [];
  projectRepositories.delete(projectKey);
  batch(() => {
    for (const key of keys) if (!referenced(key)) dropRepository(key);
    recomputeOrder();
  });
}

/** Read the status of one repository again. A reply that is no longer the newest is dropped. */
export async function refreshRepository(key: string): Promise<void> {
  const repository = state.repositories[key];
  if (!repository || !state.available) return;
  const request = (requests.get(key) ?? 0) + 1;
  requests.set(key, request);
  setState('repositories', key, 'loading', true);
  try {
    const status = await ports().git.status(repository.root);
    if (requests.get(key) !== request || !state.repositories[key]) return;
    batch(() => {
      setState('repositories', key, 'status', reconcile(status));
      setState('repositories', key, 'error', null);
    });
  } catch (err) {
    if (requests.get(key) === request && state.repositories[key]) setState('repositories', key, 'error', toAppError(err).message);
  } finally {
    if (requests.get(key) === request && state.repositories[key]) setState('repositories', key, 'loading', false);
  }
}

export const refreshAll = async (): Promise<void> => {
  await Promise.all(Object.keys(state.repositories).map(refreshRepository));
};

/** The repository that owns `path`: the deepest one above it. */
export function repositoryOfPath(path: string): RepositoryState | null {
  return repositoryFor(Object.values(state.repositories), path);
}

/** After a file was saved, only the repository that holds it needs reading again. */
export async function refreshForPath(path: string): Promise<void> {
  const repository = repositoryOfPath(path);
  if (repository) await refreshRepository(repositoryKey(repository.root));
}

/**
 * The changes at `path` across every repository: for a file its own, for a folder everything below it.
 * Repositories that neither hold the path nor sit inside it are not even looked at.
 */
export function changesAt(path: string, isDir: boolean): GitChange[] {
  const found: GitChange[] = [];
  for (const repository of Object.values(state.repositories)) {
    if (!isInside(path, repository.root) && !isInside(repository.root, path)) continue;
    const root = normalizePath(repository.root);
    for (const change of repository.status.changes) {
      const absolute = `${root}/${change.path}`;
      if (isDir ? isInside(absolute, path) && !samePath(absolute, path) : samePath(absolute, path)) found.push(change);
    }
  }
  return found;
}

export const totalChanges = (): number =>
  Object.values(state.repositories).reduce((sum, repository) => sum + repository.status.changes.length, 0);

function onGitChanged(key: string): void {
  const repository = state.repositories[key];
  if (!repository) return;
  if (repository.busy) pending.add(key);
  else void refreshRepository(key);
}

/** Run a Git operation on one repository. Only one runs at a time per repository. */
/** Gives `true` when the operation went through. */
async function mutate(key: string, operation: (root: string) => Promise<GitStatus>): Promise<boolean> {
  const repository = state.repositories[key];
  if (!repository || repository.busy) return false;
  // The operation makes any status read that is still on its way out of date.
  requests.set(key, (requests.get(key) ?? 0) + 1);
  batch(() => {
    setState('repositories', key, 'busy', true);
    setState('repositories', key, 'error', null);
  });
  let succeeded = false;
  try {
    const status = await operation(repository.root);
    if (state.repositories[key]) setState('repositories', key, 'status', reconcile(status));
    succeeded = true;
  } catch (err) {
    if (state.repositories[key]) setState('repositories', key, 'error', toAppError(err).message);
  } finally {
    if (state.repositories[key]) setState('repositories', key, 'busy', false);
  }
  if (pending.delete(key)) await refreshRepository(key);
  return succeeded;
}

const keyOf = (root: string): string => repositoryKey(root);

/** `paths` are relative to the repository. */
export const stageInRepository = async (root: string, paths: string[]): Promise<void> => {
  await mutate(keyOf(root), (repositoryRoot) => ports().git.stage(repositoryRoot, paths));
};

export const unstageInRepository = async (root: string, paths: string[]): Promise<void> => {
  await mutate(keyOf(root), (repositoryRoot) => ports().git.unstage(repositoryRoot, paths));
};

export const stageAllInRepository = async (root: string): Promise<void> => {
  await mutate(keyOf(root), (repositoryRoot) => ports().git.stageAll(repositoryRoot));
};

export const unstageAllInRepository = async (root: string): Promise<void> => {
  await mutate(keyOf(root), (repositoryRoot) => ports().git.unstageAll(repositoryRoot));
};

/** Commit what is staged. Gives `true` when the commit was made; otherwise the error is on the repository. */
export const commitInRepository = (root: string, message: string, amend: boolean, signOff: boolean): Promise<boolean> =>
  mutate(keyOf(root), (repositoryRoot) => ports().git.commit(repositoryRoot, message, amend, signOff));

/** Apply one hunk (as a patch) to the index or the working file. Gives `true` when it went through. */
export const applyHunkInRepository = (root: string, patch: string, action: 'stage' | 'unstage' | 'discard'): Promise<boolean> =>
  mutate(keyOf(root), (repositoryRoot) => ports().git.applyHunk(repositoryRoot, patch, action));

/** Throw away working-tree changes: `tracked` files are restored, `untracked` ones deleted. Ask the user first. */
export const discardInRepository = async (root: string, tracked: string[], untracked: string[]): Promise<void> => {
  await mutate(keyOf(root), (repositoryRoot) => ports().git.discard(repositoryRoot, tracked, untracked));
};

/**
 * Ask the user, then discard the working-tree side of `changes`. Untracked files are deleted, the
 * rest restored. Nothing happens if the user says no.
 */
export async function discardChangesConfirmed(root: string, changes: GitChange[]): Promise<void> {
  if (changes.length === 0) return;
  const subject =
    changes.length === 1 ? `"${changes[0].path.split('/').pop()}"` : `${changes.length} files`;
  const agreed = await ports().dialog.confirm(`Discard the changes in ${subject}? This cannot be undone.`);
  if (!agreed) return;
  const tracked = changes.filter((change) => change.kind !== 'untracked').map((change) => change.path);
  const untracked = changes.filter((change) => change.kind === 'untracked').map((change) => change.path);
  await discardInRepository(root, tracked, untracked);
}

/** The last commit message, or `null` when there is none or it cannot be read. */
export async function lastCommitMessage(root: string): Promise<string | null> {
  try {
    return await ports().git.lastMessage(root);
  } catch {
    return null;
  }
}

/** Group absolute paths by the repository that owns them, as relative paths. Paths outside every repository are dropped. */
function byRepository(paths: string[]): Array<{ root: string; paths: string[] }> {
  const groups = new Map<string, { root: string; paths: string[] }>();
  for (const path of paths) {
    const repository = repositoryOfPath(path);
    if (!repository) continue;
    const key = repositoryKey(repository.root);
    const group = groups.get(key) ?? { root: repository.root, paths: [] };
    group.paths.push(relativeToRepository(repository, path));
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Stage files given by absolute path; each repository gets one call with its own relative paths. */
export const stagePaths = async (paths: string[]): Promise<void> => {
  await Promise.all(byRepository(paths).map((group) => stageInRepository(group.root, group.paths)));
};

export const unstagePaths = async (paths: string[]): Promise<void> => {
  await Promise.all(byRepository(paths).map((group) => unstageInRepository(group.root, group.paths)));
};

/** Forget everything and stop every watcher. */
export function resetGit(): void {
  for (const repository of Object.values(state.repositories)) void ports().git.unwatch(repository.root).catch(() => undefined);
  requests.clear();
  projectRepositories.clear();
  pending.clear();
  checking = null;
  setState(reconcile(initial()));
}
