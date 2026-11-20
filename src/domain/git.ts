import { comparablePath, isInside, normalizePath, projectFor, projectName, samePath, type Project } from './workspace';

const BRANCH_REF = /^ref: refs\/heads\/(.+)$/;
const COMMIT_ID = /^[0-9a-f]{40}$/;

export type GitChangeKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'conflicted';

export interface GitChange {
  path: string;
  originalPath: string | null;
  kind: GitChangeKind;
  staged: boolean;
}

export interface GitStatus {
  isRepository: boolean;
  branch: string | null;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  changes: GitChange[];
}

export function emptyGitStatus(): GitStatus {
  return {
    isRepository: false,
    branch: null,
    detached: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    changes: [],
  };
}

/**
 * What the contents of `.git/HEAD` say is checked out: a branch name, a short
 * commit id for a detached HEAD, or `null` when it is neither.
 */
export function branchFromHead(head: string): string | null {
  const line = head.trim();
  const branch = BRANCH_REF.exec(line);
  if (branch) return branch[1];
  return COMMIT_ID.test(line) ? line.slice(0, 7) : null;
}

// ---------- repositories inside a workspace ----------

export type RepositoryKind = 'repository' | 'submodule' | 'worktree';

export interface RepositoryInfo {
  /** The folder that holds the repository (its working tree). */
  root: string;
  kind: RepositoryKind;
}

/** The key that identifies a repository, the same for every spelling of its path. */
export function repositoryKey(root: string): string {
  return comparablePath(root);
}

/** The repository that owns `path`: the deepest one above it. */
export function repositoryFor<T extends RepositoryInfo>(repositories: readonly T[], path: string): T | null {
  let best: T | null = null;
  for (const repository of repositories) {
    if (isInside(path, repository.root) && (best === null || repositoryKey(repository.root).length > repositoryKey(best.root).length)) {
      best = repository;
    }
  }
  return best;
}

/** `path` as Git wants it for this repository: relative, with forward slashes. */
export function relativeToRepository(repository: RepositoryInfo, path: string): string {
  const root = normalizePath(repository.root);
  const full = normalizePath(path);
  return full.length > root.length ? full.slice(root.length + 1) : '';
}

/** A name for a repository: its project, plus where it sits inside the project when it is nested. */
export function repositoryLabel(repository: RepositoryInfo, projects: readonly Project[]): string {
  const project = projectFor(projects, repository.root);
  if (!project) return projectName(repository.root);
  if (samePath(project.root, repository.root)) return project.name;
  return `${project.name} / ${relativeToRepository({ root: project.root, kind: 'repository' }, repository.root)}`;
}

export interface ChangeMark {
  mark: string;
  className: string;
}

/** The letter and color a file or folder shows for the changes under it, or `null` when there are none. */
export function summarizeChanges(changes: readonly Pick<GitChange, 'kind' | 'staged'>[]): ChangeMark | null {
  if (changes.length === 0) return null;
  if (changes.some((change) => change.kind === 'conflicted')) return { mark: '!', className: 'git-conflict' };
  if (changes.every((change) => change.staged)) return { mark: 'S', className: 'git-staged' };
  if (changes.some((change) => change.kind === 'untracked' || change.kind === 'added')) return { mark: 'U', className: 'git-added' };
  return { mark: 'M', className: 'git-modified' };
}
