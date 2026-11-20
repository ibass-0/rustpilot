import { beforeEach, expect, test } from 'vitest';
import { changesAt, loadProject, resetGit } from '../../src/application/gitStore';
import { emptyGitStatus, summarizeChanges, type GitChange, type GitChangeKind } from '../../src/domain/git';
import { installFakePorts } from '../helpers/ports';

const APP = 'C:\\work\\app';
const LIB = 'C:\\work\\app\\packages\\lib';
const TOOLS = 'D:\\tools';

const change = (path: string, kind: GitChangeKind = 'modified', staged = false): GitChange => ({ path, originalPath: null, kind, staged });

beforeEach(async () => {
  const fakes = installFakePorts();
  resetGit();
  fakes.git.repositories.mockImplementation(async (root: string) =>
    root === APP
      ? [
          { root: APP, kind: 'repository' },
          { root: LIB, kind: 'repository' },
        ]
      : [{ root, kind: 'repository' }],
  );
  fakes.git.status.mockImplementation(async (root: string) => ({
    ...emptyGitStatus(),
    isRepository: true,
    changes:
      root === APP
        ? [change('src/a.ts'), change('docs/readme.md', 'untracked')]
        : root === LIB
          ? [change('x.ts', 'modified', true)]
          : [change('run.ps1', 'added')],
  }));
  await loadProject({ root: APP, name: 'app' });
  await loadProject({ root: TOOLS, name: 'tools' });
});

test('a file gets the changes of the repository that owns it', () => {
  expect(changesAt('C:\\work\\app\\src\\a.ts', false)).toHaveLength(1);
  expect(changesAt('C:\\work\\app\\packages\\lib\\x.ts', false).map((c) => c.staged)).toEqual([true]);
  expect(changesAt('C:\\work\\app\\src\\unchanged.ts', false)).toEqual([]);
});

test('a folder gets every change below it, in every repository', () => {
  expect(changesAt('C:\\work\\app\\src', true)).toHaveLength(1);
  expect(changesAt('C:\\work\\app', true)).toHaveLength(3);
  expect(changesAt('C:\\work\\app\\packages', true)).toHaveLength(1);
});

test('a folder with no change below it has none', () => {
  expect(changesAt('C:\\work\\app\\assets', true)).toEqual([]);
  expect(changesAt('E:\\nowhere', true)).toEqual([]);
});

test('spelling of the path does not matter', () => {
  expect(changesAt('c:/WORK/app/SRC/A.ts', false)).toHaveLength(1);
});

test('a second project is decorated too', () => {
  expect(changesAt('D:\\tools\\run.ps1', false)).toHaveLength(1);
});

test('a folder is not decorated by a sibling with the same prefix', () => {
  expect(changesAt('C:\\work\\ap', true)).toEqual([]);
});

// ---------- the mark ----------

test('no changes means no mark', () => {
  expect(summarizeChanges([])).toBeNull();
});

test('a conflict wins over everything', () => {
  expect(summarizeChanges([change('a', 'modified'), change('b', 'conflicted')])).toEqual({ mark: '!', className: 'git-conflict' });
});

test('only staged changes show S', () => {
  expect(summarizeChanges([change('a', 'modified', true), change('b', 'added', true)])).toEqual({ mark: 'S', className: 'git-staged' });
});

test('new files show U, other edits show M', () => {
  expect(summarizeChanges([change('a', 'untracked')])).toEqual({ mark: 'U', className: 'git-added' });
  expect(summarizeChanges([change('a', 'added'), change('b', 'modified')])).toEqual({ mark: 'U', className: 'git-added' });
  expect(summarizeChanges([change('a', 'modified'), change('b', 'deleted')])).toEqual({ mark: 'M', className: 'git-modified' });
});
