import { describe, expect, test } from 'vitest';
import {
  buildChangeTree,
  groupChanges,
  nextHistoryIndex,
  rememberMessage,
  validateCommit,
  type ChangeTreeNode,
} from '../../src/domain/commit';
import type { GitChange, GitChangeKind } from '../../src/domain/git';

const change = (path: string, kind: GitChangeKind = 'modified', staged = false): GitChange => ({ path, originalPath: null, kind, staged });

describe('groupChanges', () => {
  test('splits conflicts, staged, working and untracked changes', () => {
    const groups = groupChanges([
      change('a.ts', 'modified', true),
      change('b.ts', 'modified', false),
      change('c.ts', 'untracked', false),
      change('d.ts', 'conflicted', false),
      change('e.ts', 'added', true),
      change('f.ts', 'deleted', false),
    ]);
    expect(groups.conflicts.map((c) => c.path)).toEqual(['d.ts']);
    expect(groups.staged.map((c) => c.path)).toEqual(['a.ts', 'e.ts']);
    expect(groups.working.map((c) => c.path)).toEqual(['b.ts', 'f.ts']);
    expect(groups.untracked.map((c) => c.path)).toEqual(['c.ts']);
  });

  test('a file changed both in the index and the working tree appears in both groups', () => {
    const groups = groupChanges([change('a.ts', 'modified', true), change('a.ts', 'modified', false)]);
    expect(groups.staged).toHaveLength(1);
    expect(groups.working).toHaveLength(1);
  });

  test('nothing changed gives empty groups', () => {
    expect(groupChanges([])).toEqual({ conflicts: [], staged: [], working: [], untracked: [] });
  });
});

describe('validateCommit', () => {
  test('needs a message', () => {
    expect(validateCommit('', { amend: false, stagedCount: 1 })).toBe('Enter a commit message.');
    expect(validateCommit('  \n ', { amend: false, stagedCount: 1 })).toBe('Enter a commit message.');
  });

  test('needs something staged unless amending', () => {
    expect(validateCommit('msg', { amend: false, stagedCount: 0 })).toBe('There is nothing staged to commit.');
    expect(validateCommit('msg', { amend: true, stagedCount: 0 })).toBeNull();
    expect(validateCommit('msg', { amend: false, stagedCount: 2 })).toBeNull();
  });

  test('the message problem comes first', () => {
    expect(validateCommit('', { amend: false, stagedCount: 0 })).toBe('Enter a commit message.');
  });
});

describe('rememberMessage', () => {
  test('puts the newest first and drops older copies', () => {
    expect(rememberMessage(['b', 'a'], 'a', 20)).toEqual(['a', 'b']);
    expect(rememberMessage([], '  new  \n', 20)).toEqual(['new']);
  });

  test('ignores blank messages and keeps at most the limit', () => {
    expect(rememberMessage(['a'], '   ', 20)).toEqual(['a']);
    expect(rememberMessage(['c', 'b', 'a'], 'd', 3)).toEqual(['d', 'c', 'b']);
  });
});

describe('nextHistoryIndex', () => {
  test('older steps go back through the list and stop at the oldest', () => {
    expect(nextHistoryIndex(-1, 3, 'older')).toBe(0);
    expect(nextHistoryIndex(0, 3, 'older')).toBe(1);
    expect(nextHistoryIndex(2, 3, 'older')).toBe(2);
  });

  test('newer comes back to the draft (-1)', () => {
    expect(nextHistoryIndex(1, 3, 'newer')).toBe(0);
    expect(nextHistoryIndex(0, 3, 'newer')).toBe(-1);
    expect(nextHistoryIndex(-1, 3, 'newer')).toBe(-1);
  });

  test('an empty history never moves', () => {
    expect(nextHistoryIndex(-1, 0, 'older')).toBe(-1);
  });
});

describe('buildChangeTree', () => {
  const names = (nodes: ChangeTreeNode[]): string[] => nodes.map((n) => n.name);

  test('folders come first, then files, each sorted', () => {
    const tree = buildChangeTree([change('b.ts'), change('src/z.ts'), change('src/a.ts'), change('a.ts'), change('docs/x.md')]);
    expect(names(tree)).toEqual(['docs', 'src', 'a.ts', 'b.ts']);
    const src = tree.find((n) => n.name === 'src')!;
    expect(names(src.children)).toEqual(['a.ts', 'z.ts']);
    expect(src.path).toBe('src');
    expect(src.count).toBe(2);
  });

  test('single-child folder chains are shown as one folder', () => {
    const tree = buildChangeTree([change('packages/ui/src/button.ts'), change('packages/ui/src/icon.ts')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('packages/ui/src');
    expect(tree[0].path).toBe('packages/ui/src');
    expect(tree[0].count).toBe(2);
  });

  test('a folder with files and subfolders is not merged into its child', () => {
    const tree = buildChangeTree([change('src/a.ts'), change('src/deep/b.ts')]);
    expect(tree[0].name).toBe('src');
    expect(names(tree[0].children)).toEqual(['deep', 'a.ts']);
  });

  test('a file node carries its change and a folder carries every change below it', () => {
    const tree = buildChangeTree([change('src/a.ts', 'added'), change('src/sub/b.ts', 'modified')]);
    const src = tree[0];
    expect(src.change).toBeNull();
    expect(src.changes.map((c) => c.path).sort()).toEqual(['src/a.ts', 'src/sub/b.ts']);
    expect(src.children.find((n) => n.name === 'a.ts')?.change?.kind).toBe('added');
  });

  test('folders and files with unusual names are kept intact', () => {
    const tree = buildChangeTree([change('dir with space/é ü.ts')]);
    expect(tree[0].name).toBe('dir with space');
    expect(tree[0].children[0].name).toBe('é ü.ts');
  });

  test('no changes give an empty tree', () => {
    expect(buildChangeTree([])).toEqual([]);
  });
});
