import { Channel } from '@tauri-apps/api/core';
import type { GitBlameLine, GitPort } from '../../application/ports';
import type { FileVersions, GitStatus, RepositoryInfo } from '../../domain/git';
import { call } from './invoke';

export const tauriGit: GitPort = {
  repositories: (root) => call<RepositoryInfo[]>('git_repositories', { root }),
  version: () => call<string>('git_version'),
  async watch(root, onChange) {
    const channel = new Channel<null>();
    channel.onmessage = () => onChange();
    await call<null>('git_watch', { root, onChange: channel });
  },
  unwatch: (root) => call<null>('git_unwatch', { root }).then(() => undefined),
  status: (root) => call<GitStatus>('git_status', { root }),
  diff: (root, path, staged) => call<string>('git_diff', { root, path, staged }),
  stage: (root, paths) => call<GitStatus>('git_stage', { root, paths }),
  unstage: (root, paths) => call<GitStatus>('git_unstage', { root, paths }),
  commit: (root, message, amend, signOff) => call<GitStatus>('git_commit', { root, message, amend, signOff }),
  lastMessage: (root) => call<string | null>('git_last_message', { root }),
  discard: (root, tracked, untracked) => call<GitStatus>('git_discard', { root, tracked, untracked }),
  applyHunk: (root, patch, action) => call<GitStatus>('git_apply_hunk', { root, patch, action }),
  fileVersions: (root, path, staged) => call<FileVersions>('git_file_versions', { root, path, staged }),
  stageAll: (root) => call<GitStatus>('git_stage_all', { root }),
  unstageAll: (root) => call<GitStatus>('git_unstage_all', { root }),
  blame: (root, path) => call<GitBlameLine[]>('git_blame', { root, path }),
};
