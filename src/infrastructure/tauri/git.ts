import type { GitPort } from '../../application/ports';
import type { GitStatus } from '../../domain/git';
import { call } from './invoke';

export const tauriGit: GitPort = {
  repositories: (root) => call<string[]>('git_repositories', { root }),
  status: (root) => call<GitStatus>('git_status', { root }),
  diff: (root, path, staged) => call<string>('git_diff', { root, path, staged }),
  stage: (root, paths) => call<GitStatus>('git_stage', { root, paths }),
  unstage: (root, paths) => call<GitStatus>('git_unstage', { root, paths }),
};
