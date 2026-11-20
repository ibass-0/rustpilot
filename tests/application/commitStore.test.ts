import { beforeEach, expect, test } from 'vitest';
import {
  browseHistory,
  commitDraft,
  commitRepository,
  loadCommitHistory,
  resetCommit,
  setAmend,
  setCommitView,
  setMessage,
  setSignOff,
  commitState,
} from '../../src/application/commitStore';
import { git, loadProject, resetGit } from '../../src/application/gitStore';
import { AppError } from '../../src/domain/fs';
import { emptyGitStatus, repositoryKey, type GitChange, type GitStatus } from '../../src/domain/git';
import { installFakePorts } from '../helpers/ports';

const APP = 'C:\\work\\app';
const KEY = repositoryKey(APP);
const HISTORY_KEY = 'rustpilot.git.messageHistory';
let fakes: ReturnType<typeof installFakePorts>;

const change = (path: string, staged: boolean): GitChange => ({ path, originalPath: null, kind: 'modified', staged });
const status = (changes: GitChange[]): GitStatus => ({ ...emptyGitStatus(), isRepository: true, branch: 'main', changes });

async function open(changes: GitChange[]) {
  fakes.git.repositories.mockResolvedValue([{ root: APP, kind: 'repository' }]);
  fakes.git.status.mockResolvedValue(status(changes));
  await loadProject({ root: APP, name: 'app' });
}

beforeEach(() => {
  fakes = installFakePorts();
  resetGit();
  resetCommit();
});

test('a repository starts with an empty draft', () => {
  expect(commitDraft(KEY)).toMatchObject({ message: '', amend: false, signOff: false, error: null });
});

test('typing updates the draft of that repository only', () => {
  setMessage(KEY, 'fix: thing');
  expect(commitDraft(KEY).message).toBe('fix: thing');
  expect(commitDraft('other').message).toBe('');
});

test('editing the message clears an earlier error', async () => {
  await open([change('a.ts', false)]);
  setMessage(KEY, 'msg');
  await commitRepository(APP);
  expect(commitDraft(KEY).error).toBe('There is nothing staged to commit.');
  setMessage(KEY, 'msg again');
  expect(commitDraft(KEY).error).toBeNull();
});

test('committing with nothing staged is refused before Git is asked', async () => {
  await open([change('a.ts', false)]);
  setMessage(KEY, 'msg');
  expect(await commitRepository(APP)).toBe(false);
  expect(fakes.git.commit).not.toHaveBeenCalled();
});

test('committing without a message is refused', async () => {
  await open([change('a.ts', true)]);
  expect(await commitRepository(APP)).toBe(false);
  expect(commitDraft(KEY).error).toBe('Enter a commit message.');
  expect(fakes.git.commit).not.toHaveBeenCalled();
});

test('a successful commit sends the message, clears the draft and remembers the message', async () => {
  await open([change('a.ts', true)]);
  fakes.git.commit.mockResolvedValue(status([]));
  setMessage(KEY, '  feat: add it\n\nbody  ');
  expect(await commitRepository(APP)).toBe(true);
  expect(fakes.git.commit).toHaveBeenCalledWith(APP, '  feat: add it\n\nbody  ', false, false);
  expect(commitDraft(KEY)).toMatchObject({ message: '', amend: false, error: null });
  expect(git.repositories[KEY].status.changes).toEqual([]);
  expect(JSON.parse(fakes.storage.get(HISTORY_KEY) ?? '[]')).toEqual(['feat: add it\n\nbody']);
});

test('sign-off and amend are passed to Git', async () => {
  await open([change('a.ts', true)]);
  fakes.git.commit.mockResolvedValue(status([]));
  setMessage(KEY, 'msg');
  setSignOff(KEY, true);
  await setAmend(KEY, true);
  await commitRepository(APP);
  expect(fakes.git.commit).toHaveBeenCalledWith(APP, 'msg', true, true);
});

test('amending needs nothing staged', async () => {
  await open([]);
  fakes.git.commit.mockResolvedValue(status([]));
  setMessage(KEY, 'reworded');
  await setAmend(KEY, true);
  expect(await commitRepository(APP)).toBe(true);
});

test('turning amend on fills in the last commit message when the box is empty', async () => {
  await open([]);
  fakes.git.lastMessage.mockResolvedValue('previous subject\n\nbody');
  await setAmend(KEY, true);
  expect(commitDraft(KEY).message).toBe('previous subject\n\nbody');
  expect(fakes.git.lastMessage).toHaveBeenCalledWith(APP);
});

test('turning amend on keeps what was already typed', async () => {
  await open([]);
  fakes.git.lastMessage.mockResolvedValue('previous');
  setMessage(KEY, 'my own words');
  await setAmend(KEY, true);
  expect(commitDraft(KEY).message).toBe('my own words');
});

test('a failure to read the last message is not an error', async () => {
  await open([]);
  fakes.git.lastMessage.mockRejectedValue(new AppError('io', 'no commits'));
  await setAmend(KEY, true);
  expect(commitDraft(KEY).amend).toBe(true);
  expect(commitDraft(KEY).message).toBe('');
});

test('a rejected commit keeps the message and shows what Git said, such as a hook failure', async () => {
  await open([change('a.ts', true)]);
  fakes.git.commit.mockRejectedValue(new AppError('io', 'lint failed: fix the style'));
  setMessage(KEY, 'wip');
  expect(await commitRepository(APP)).toBe(false);
  expect(commitDraft(KEY).message).toBe('wip');
  expect(commitDraft(KEY).error).toBe('lint failed: fix the style');
});

test('messages are remembered newest first, without repeats, and survive a reload', async () => {
  await open([change('a.ts', true)]);
  fakes.git.commit.mockResolvedValue(status([change('b.ts', true)]));
  for (const message of ['first', 'second', 'first']) {
    setMessage(KEY, message);
    await commitRepository(APP);
  }
  resetCommit();
  loadCommitHistory();
  expect(JSON.parse(fakes.storage.get(HISTORY_KEY) ?? '[]')).toEqual(['first', 'second']);
});

test('browsing the history goes back through earlier messages and returns to the draft', () => {
  fakes.storage.set(HISTORY_KEY, JSON.stringify(['newest', 'older', 'oldest']));
  loadCommitHistory();
  setMessage(KEY, 'half typed');
  browseHistory(KEY, 'older');
  expect(commitDraft(KEY).message).toBe('newest');
  browseHistory(KEY, 'older');
  expect(commitDraft(KEY).message).toBe('older');
  browseHistory(KEY, 'newer');
  browseHistory(KEY, 'newer');
  expect(commitDraft(KEY).message).toBe('half typed');
});

test('damaged history storage gives an empty history', () => {
  fakes.storage.set(HISTORY_KEY, '{oops');
  loadCommitHistory();
  browseHistory(KEY, 'older');
  expect(commitDraft(KEY).message).toBe('');
});

test('the draft of one repository does not leak into another after a commit', async () => {
  await open([change('a.ts', true)]);
  fakes.git.commit.mockResolvedValue(status([]));
  setMessage(KEY, 'one');
  setMessage('other', 'keep me');
  await commitRepository(APP);
  expect(commitState.drafts['other'].message).toBe('keep me');
});

test('the changes view defaults to a list, can be switched, and is remembered', () => {
  expect(commitState.view).toBe('list');
  setCommitView('tree');
  expect(commitState.view).toBe('tree');
  expect(fakes.storage.get('rustpilot.git.commitView')).toBe('tree');
  resetCommit();
  loadCommitHistory();
  expect(commitState.view).toBe('tree');
});

test('an unknown stored view falls back to the list', () => {
  fakes.storage.set('rustpilot.git.commitView', 'cards');
  loadCommitHistory();
  expect(commitState.view).toBe('list');
});
