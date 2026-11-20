import { beforeEach, expect, test } from 'vitest';
import {
  applyHunkAction,
  closeDiff,
  diff,
  loadDiffPrefs,
  openDiff,
  setDiffMode,
  stepHunk,
} from '../../src/application/diffStore';
import { loadProject, resetGit } from '../../src/application/gitStore';
import { AppError } from '../../src/domain/fs';
import { emptyGitStatus } from '../../src/domain/git';
import { installFakePorts } from '../helpers/ports';

const ROOT = 'C:\\work\\app';
const MODE_KEY = 'rustpilot.git.diffMode';
let fakes: ReturnType<typeof installFakePorts>;

const TWO_HUNKS = [
  'diff --git a/f.txt b/f.txt',
  'index 1..2 100644',
  '--- a/f.txt',
  '+++ b/f.txt',
  '@@ -1,3 +1,3 @@',
  ' a',
  '-b',
  '+B',
  ' c',
  '@@ -20,3 +20,3 @@',
  ' x',
  '-y',
  '+Y',
  ' z',
  '',
].join('\n');

beforeEach(async () => {
  fakes = installFakePorts();
  resetGit();
  closeDiff();
  fakes.git.repositories.mockResolvedValue([{ root: ROOT, kind: 'repository' }]);
  fakes.git.status.mockResolvedValue({ ...emptyGitStatus(), isRepository: true });
  await loadProject({ root: ROOT, name: 'app' });
  fakes.git.diff.mockResolvedValue(TWO_HUNKS);
  fakes.git.fileVersions.mockResolvedValue({ original: 'a\nb\nc\n', modified: 'a\nB\nc\n' });
});

test('opening a diff keeps the text and its parsed hunks', async () => {
  await openDiff(ROOT, 'f.txt', false);
  expect(diff.path).toBe('f.txt');
  expect(diff.files[0].hunks).toHaveLength(2);
  expect(diff.hunkIndex).toBe(0);
  expect(diff.loading).toBe(false);
});

test('an error is shown and no hunks are offered', async () => {
  fakes.git.diff.mockRejectedValue(new AppError('io', 'bad revision'));
  await openDiff(ROOT, 'f.txt', false);
  expect(diff.error).toBe('bad revision');
  expect(diff.files).toEqual([]);
});

test('a slow diff does not replace a newer one', async () => {
  let finishOld!: (text: string) => void;
  fakes.git.diff.mockReturnValueOnce(new Promise<string>((resolve) => (finishOld = resolve)));
  const old = openDiff(ROOT, 'old.txt', false);
  await openDiff(ROOT, 'new.txt', false);
  finishOld('diff --git a/old.txt b/old.txt\n--- a/old.txt\n+++ b/old.txt\n@@ -1 +1 @@\n-a\n+b\n');
  await old;
  expect(diff.path).toBe('new.txt');
  expect(diff.files[0].hunks).toHaveLength(2);
});

test('the view mode is remembered and defaults to unified', () => {
  loadDiffPrefs();
  expect(diff.mode).toBe('unified');
  setDiffMode('split');
  expect(fakes.storage.get(MODE_KEY)).toBe('split');
  fakes.storage.set(MODE_KEY, 'split');
  loadDiffPrefs();
  expect(diff.mode).toBe('split');
  fakes.storage.set(MODE_KEY, 'nonsense');
  loadDiffPrefs();
  expect(diff.mode).toBe('unified');
});

test('side-by-side loads both versions of the file', async () => {
  setDiffMode('split');
  await openDiff(ROOT, 'f.txt', true);
  expect(fakes.git.fileVersions).toHaveBeenCalledWith(ROOT, 'f.txt', true);
  expect(diff.versions).toEqual({ original: 'a\nb\nc\n', modified: 'a\nB\nc\n' });
});

test('switching to side-by-side while a diff is open loads the versions then', async () => {
  setDiffMode('unified');
  await openDiff(ROOT, 'f.txt', false);
  expect(fakes.git.fileVersions).not.toHaveBeenCalled();
  setDiffMode('split');
  await new Promise((r) => setTimeout(r, 0));
  expect(diff.versions).not.toBeNull();
});

test('a file that cannot be compared as text says why in split mode', async () => {
  fakes.git.fileVersions.mockRejectedValue(new AppError('io', 'Binary files cannot be compared as text.'));
  setDiffMode('split');
  await openDiff(ROOT, 'b.bin', false);
  expect(diff.versionsError).toBe('Binary files cannot be compared as text.');
});

test('stepping through hunks stops at both ends', async () => {
  await openDiff(ROOT, 'f.txt', false);
  stepHunk(1);
  expect(diff.hunkIndex).toBe(1);
  stepHunk(1);
  expect(diff.hunkIndex).toBe(1);
  stepHunk(-1);
  stepHunk(-1);
  expect(diff.hunkIndex).toBe(0);
});

test('staging a hunk sends just that hunk, then reads the diff and the repository again', async () => {
  await openDiff(ROOT, 'f.txt', false);
  fakes.git.applyHunk.mockResolvedValue({ ...emptyGitStatus(), isRepository: true });
  fakes.git.diff.mockResolvedValue(TWO_HUNKS.split('@@ -20,3')[0]);
  await applyHunkAction(1, 'stage');
  const [root, patch, action] = fakes.git.applyHunk.mock.calls[0];
  expect(root).toBe(ROOT);
  expect(action).toBe('stage');
  expect(patch).toContain('@@ -20,3 +20,3 @@');
  expect(patch).not.toContain('+B');
  expect(diff.files[0].hunks).toHaveLength(1);
});

test('unstaging a hunk uses the unstage action', async () => {
  await openDiff(ROOT, 'f.txt', true);
  fakes.git.applyHunk.mockResolvedValue({ ...emptyGitStatus(), isRepository: true });
  await applyHunkAction(0, 'unstage');
  expect(fakes.git.applyHunk.mock.calls[0][2]).toBe('unstage');
});

test('discarding a hunk asks first and does nothing when declined', async () => {
  await openDiff(ROOT, 'f.txt', false);
  fakes.dialog.confirm.mockResolvedValueOnce(false);
  await applyHunkAction(0, 'discard');
  expect(fakes.git.applyHunk).not.toHaveBeenCalled();
  expect(fakes.dialog.confirm.mock.calls[0][0]).toContain('cannot be undone');
});

test('discarding a hunk after confirmation sends it', async () => {
  await openDiff(ROOT, 'f.txt', false);
  fakes.git.applyHunk.mockResolvedValue({ ...emptyGitStatus(), isRepository: true });
  await applyHunkAction(0, 'discard');
  expect(fakes.git.applyHunk.mock.calls[0][2]).toBe('discard');
});

test('a hunk that cannot be applied shows the message and keeps the diff', async () => {
  await openDiff(ROOT, 'f.txt', false);
  fakes.git.applyHunk.mockRejectedValue(new AppError('io', 'patch does not apply'));
  await applyHunkAction(0, 'stage');
  expect(diff.error).toBe('patch does not apply');
  expect(diff.files[0].hunks).toHaveLength(2);
});

test('an unknown hunk is ignored', async () => {
  await openDiff(ROOT, 'f.txt', false);
  await applyHunkAction(9, 'stage');
  expect(fakes.git.applyHunk).not.toHaveBeenCalled();
});

test('closing clears everything', async () => {
  await openDiff(ROOT, 'f.txt', false);
  closeDiff();
  expect(diff.path).toBeNull();
  expect(diff.files).toEqual([]);
});
