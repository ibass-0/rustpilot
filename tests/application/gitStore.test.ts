import { beforeEach, expect, test } from 'vitest';
import { closeGit, git, loadGit, refreshGit, stagePaths, unstagePaths } from '../../src/application/gitStore';
import { AppError } from '../../src/domain/fs';
import type { GitStatus } from '../../src/domain/git';
import { installFakePorts } from '../helpers/ports';

let fakes: ReturnType<typeof installFakePorts>;

beforeEach(() => {
  fakes = installFakePorts();
  closeGit();
});

test('loads a structured repository status', async () => {
  fakes.git.status.mockResolvedValue({
    isRepository: true,
    branch: 'feature/git',
    detached: false,
    upstream: 'origin/feature/git',
    ahead: 2,
    behind: 1,
    changes: [{ path: 'src/a.ts', originalPath: null, kind: 'modified', staged: false }],
  });
  await loadGit('C:\\p');
  expect(git.root).toBe('C:\\p');
  expect(git.status.branch).toBe('feature/git');
  expect(git.status.changes).toHaveLength(1);
  expect(git.error).toBeNull();
});

test('a Git failure does not reject and is available to the UI', async () => {
  fakes.git.status.mockRejectedValue(new AppError('notFound', 'Git is not installed'));
  await expect(loadGit('C:\\p')).resolves.toMatchObject({ isRepository: false });
  expect(git.error).toBe('Git is not installed');
  expect(git.loading).toBe(false);
});

test('only the newest overlapping request updates state', async () => {
  let finishOld!: (value: GitStatus) => void;
  const status = (branch: string): GitStatus => ({
    isRepository: true,
    branch,
    detached: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    changes: [],
  });
  fakes.git.status.mockImplementationOnce(() => new Promise((resolve) => (finishOld = resolve)));
  const old = loadGit('C:\\old');
  fakes.git.status.mockResolvedValueOnce(status('new'));
  await loadGit('C:\\new');
  finishOld(status('old'));
  await old;
  expect(git.root).toBe('C:\\new');
  expect(git.status.branch).toBe('new');
});

test('refresh reloads the current root and close clears it', async () => {
  await loadGit('C:\\p');
  fakes.git.status.mockClear();
  await refreshGit();
  expect(fakes.git.status).toHaveBeenCalledWith('C:\\p');
  closeGit();
  expect(git.root).toBeNull();
});

test('stage and unstage replace status with the backend snapshot', async () => {
  await loadGit('C:\\p');
  const staged = {
    isRepository: true,
    branch: 'main',
    detached: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    changes: [{ path: 'a.ts', originalPath: null, kind: 'modified' as const, staged: true }],
  };
  fakes.git.stage.mockResolvedValue(staged);
  await stagePaths(['a.ts']);
  expect(fakes.git.stage).toHaveBeenCalledWith('C:\\p', ['a.ts']);
  expect(git.status.changes[0].staged).toBe(true);

  fakes.git.unstage.mockResolvedValue({ ...staged, changes: [{ ...staged.changes[0], staged: false }] });
  await unstagePaths(['a.ts']);
  expect(fakes.git.unstage).toHaveBeenCalledWith('C:\\p', ['a.ts']);
  expect(git.status.changes[0].staged).toBe(false);
});

test('a failed mutation preserves status and exposes its error', async () => {
  await loadGit('C:\\p');
  fakes.git.stage.mockRejectedValue(new AppError('io', 'index is locked'));
  await stagePaths(['a.ts']);
  expect(git.status.isRepository).toBe(false);
  expect(git.error).toBe('index is locked');
  expect(git.busy).toBe(false);
});
