import { beforeEach, expect, test } from 'vitest';
import {
  commitInRepository,
  discardChangesConfirmed,
  discardInRepository,
  git,
  lastCommitMessage,
  loadProject,
  resetGit,
  stageAllInRepository,
  unstageAllInRepository,
} from '../../src/application/gitStore';
import { AppError } from '../../src/domain/fs';
import { emptyGitStatus, repositoryKey, type GitStatus } from '../../src/domain/git';
import { installFakePorts } from '../helpers/ports';

const APP = 'C:\\work\\app';
const KEY = repositoryKey(APP);
let fakes: ReturnType<typeof installFakePorts>;

const status = (n: number): GitStatus => ({
  ...emptyGitStatus(),
  isRepository: true,
  changes: Array.from({ length: n }, (_, i) => ({ path: `f${i}.ts`, originalPath: null, kind: 'modified' as const, staged: false })),
});

beforeEach(async () => {
  fakes = installFakePorts();
  resetGit();
  fakes.git.repositories.mockResolvedValue([{ root: APP, kind: 'repository' }]);
  fakes.git.status.mockResolvedValue(status(2));
  await loadProject({ root: APP, name: 'app' });
});

test('a commit applies the status Git returns and reports success', async () => {
  fakes.git.commit.mockResolvedValue(status(0));
  expect(await commitInRepository(APP, 'msg', false, true)).toBe(true);
  expect(fakes.git.commit).toHaveBeenCalledWith(APP, 'msg', false, true);
  expect(git.repositories[KEY].status.changes).toEqual([]);
  expect(git.repositories[KEY].busy).toBe(false);
});

test('a failed commit reports failure and keeps the error on the repository', async () => {
  fakes.git.commit.mockRejectedValue(new AppError('io', 'hook said no'));
  expect(await commitInRepository(APP, 'msg', false, false)).toBe(false);
  expect(git.repositories[KEY].error).toBe('hook said no');
  expect(git.repositories[KEY].status.changes).toHaveLength(2);
});

test('discard sends tracked and untracked paths separately', async () => {
  fakes.git.discard.mockResolvedValue(status(0));
  await discardInRepository(APP, ['a.ts'], ['new.txt']);
  expect(fakes.git.discard).toHaveBeenCalledWith(APP, ['a.ts'], ['new.txt']);
  expect(git.repositories[KEY].status.changes).toEqual([]);
});

test('stage all and unstage all use the repository status they return', async () => {
  fakes.git.stageAll.mockResolvedValue(status(3));
  await stageAllInRepository(APP);
  expect(git.repositories[KEY].status.changes).toHaveLength(3);
  fakes.git.unstageAll.mockResolvedValue(status(1));
  await unstageAllInRepository(APP);
  expect(git.repositories[KEY].status.changes).toHaveLength(1);
});

test('the last commit message is read, and a failure gives null', async () => {
  fakes.git.lastMessage.mockResolvedValueOnce('subject');
  expect(await lastCommitMessage(APP)).toBe('subject');
  fakes.git.lastMessage.mockRejectedValueOnce(new AppError('io', 'bad'));
  expect(await lastCommitMessage(APP)).toBeNull();
  fakes.git.lastMessage.mockResolvedValueOnce(null);
  expect(await lastCommitMessage(APP)).toBeNull();
});

test('operations on an unknown repository do nothing', async () => {
  expect(await commitInRepository('Z:\\nowhere', 'msg', false, false)).toBe(false);
  expect(fakes.git.commit).not.toHaveBeenCalled();
});

test('discarding asks first, naming how many files and that it cannot be undone', async () => {
  fakes.git.discard.mockResolvedValue(status(0));
  const changes = [
    { path: 'a.ts', originalPath: null, kind: 'modified' as const, staged: false },
    { path: 'gone.ts', originalPath: null, kind: 'deleted' as const, staged: false },
    { path: 'new.txt', originalPath: null, kind: 'untracked' as const, staged: false },
  ];
  await discardChangesConfirmed(APP, changes);
  const message = fakes.dialog.confirm.mock.calls[0][0] as string;
  expect(message).toContain('3 files');
  expect(message).toContain('cannot be undone');
  expect(fakes.git.discard).toHaveBeenCalledWith(APP, ['a.ts', 'gone.ts'], ['new.txt']);
});

test('discarding one file names the file', async () => {
  fakes.git.discard.mockResolvedValue(status(0));
  await discardChangesConfirmed(APP, [{ path: 'src/a.ts', originalPath: null, kind: 'modified', staged: false }]);
  expect(fakes.dialog.confirm.mock.calls[0][0]).toContain('a.ts');
});

test('declining the confirmation discards nothing', async () => {
  fakes.dialog.confirm.mockResolvedValueOnce(false);
  await discardChangesConfirmed(APP, [{ path: 'a.ts', originalPath: null, kind: 'modified', staged: false }]);
  expect(fakes.git.discard).not.toHaveBeenCalled();
});

test('discarding no changes does not even ask', async () => {
  await discardChangesConfirmed(APP, []);
  expect(fakes.dialog.confirm).not.toHaveBeenCalled();
});
