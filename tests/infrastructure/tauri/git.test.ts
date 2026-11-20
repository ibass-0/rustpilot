import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, expect, test } from 'vitest';
import { tauriGit } from '../../../src/infrastructure/tauri/git';

afterEach(() => clearMocks());

test('status invokes the backend with the workspace root', async () => {
  const expected = {
    isRepository: true,
    branch: 'main',
    detached: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    changes: [],
  };
  const calls: unknown[] = [];
  mockIPC((command, args) => {
    calls.push({ command, args });
    return expected;
  });
  await expect(tauriGit.status('C:\\p')).resolves.toEqual(expected);
  expect(calls).toEqual([{ command: 'git_status', args: { root: 'C:\\p' } }]);
});

test('repositories invokes discovery with the workspace root', async () => {
  mockIPC(() => ['C:\\workspace\\app', 'C:\\workspace\\api']);
  await expect(tauriGit.repositories('C:\\workspace')).resolves.toEqual(['C:\\workspace\\app', 'C:\\workspace\\api']);
});

test('stage and unstage send paths as data', async () => {
  const calls: unknown[] = [];
  mockIPC((command, args) => {
    calls.push({ command, args });
    return { isRepository: true, branch: 'main', detached: false, upstream: null, ahead: 0, behind: 0, changes: [] };
  });
  await tauriGit.stage('C:\\p', ['--looks-like-option', 'src/a b.ts']);
  await tauriGit.unstage('C:\\p', ['src/a b.ts']);
  expect(calls).toEqual([
    { command: 'git_stage', args: { root: 'C:\\p', paths: ['--looks-like-option', 'src/a b.ts'] } },
    { command: 'git_unstage', args: { root: 'C:\\p', paths: ['src/a b.ts'] } },
  ]);
});

test('diff sends repository, path, and staged flag', async () => {
  const calls: unknown[] = [];
  mockIPC((command, args) => {
    calls.push({ command, args });
    return '@@ -1 +1 @@';
  });
  await expect(tauriGit.diff('C:\\p', 'src/a b.ts', true)).resolves.toBe('@@ -1 +1 @@');
  expect(calls).toEqual([{ command: 'git_diff', args: { root: 'C:\\p', path: 'src/a b.ts', staged: true } }]);
});
