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
