import { expect, test } from 'vitest';
import { joinPath } from '../../src/domain/fs';
import { branchFromHead } from '../../src/domain/git';

test.each([
  ['ref: refs/heads/master\n', 'master'],
  ['ref: refs/heads/main', 'main'],
  ['ref: refs/heads/feature/terminal\r\n', 'feature/terminal'],
])('HEAD %j is on branch %s', (head, branch) => {
  expect(branchFromHead(head)).toBe(branch);
});

test('a detached HEAD is shown as a short commit id', () => {
  expect(branchFromHead('3d8a61f0c2b4e6a8901234567890abcdef123456\n')).toBe('3d8a61f');
});

test.each(['', 'garbage', 'ref: refs/tags/v1', 'ref: refs/heads/'])('HEAD %j has no branch', (head) => {
  expect(branchFromHead(head)).toBeNull();
});

test('joinPath uses the separator the base path already uses', () => {
  expect(joinPath('C:\\p', '.git', 'HEAD')).toBe('C:\\p\\.git\\HEAD');
  expect(joinPath('/home/me/p', '.git', 'HEAD')).toBe('/home/me/p/.git/HEAD');
  expect(joinPath('C:\\p\\', 'a')).toBe('C:\\p\\a');
});
