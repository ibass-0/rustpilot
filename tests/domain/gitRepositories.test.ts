import { describe, expect, test } from 'vitest';
import {
  relativeToRepository,
  repositoryFor,
  repositoryKey,
  repositoryLabel,
  type RepositoryInfo,
} from '../../src/domain/git';
import type { Project } from '../../src/domain/workspace';

const repo = (root: string, kind: RepositoryInfo['kind'] = 'repository'): RepositoryInfo => ({ root, kind });

const repos = [repo('C:\\work\\app'), repo('C:\\work\\app\\packages\\lib'), repo('C:\\work\\app\\packages\\lib\\vendor', 'submodule'), repo('D:\\tools')];

describe('repositoryFor', () => {
  test('a file belongs to the deepest repository above it', () => {
    expect(repositoryFor(repos, 'C:\\work\\app\\packages\\lib\\x.ts')?.root).toBe('C:\\work\\app\\packages\\lib');
    expect(repositoryFor(repos, 'C:\\work\\app\\packages\\lib\\vendor\\y.c')?.kind).toBe('submodule');
    expect(repositoryFor(repos, 'C:\\work\\app\\src\\a.ts')?.root).toBe('C:\\work\\app');
  });

  test('case and slash style do not matter', () => {
    expect(repositoryFor(repos, 'c:/WORK/app/packages/LIB/x.ts')?.root).toBe('C:\\work\\app\\packages\\lib');
  });

  test('a repository root belongs to itself, and a sibling with a longer name does not match', () => {
    expect(repositoryFor(repos, 'D:\\tools')?.root).toBe('D:\\tools');
    expect(repositoryFor(repos, 'C:\\work\\application\\a.ts')).toBeNull();
  });

  test('a path outside every repository has none', () => {
    expect(repositoryFor(repos, 'E:\\nothing\\here')).toBeNull();
    expect(repositoryFor([], 'C:\\work\\app\\a.ts')).toBeNull();
  });
});

describe('relativeToRepository', () => {
  test('gives the path Git expects, with forward slashes', () => {
    expect(relativeToRepository(repo('C:\\work\\app'), 'C:\\work\\app\\src\\dir with space\\é.ts')).toBe('src/dir with space/é.ts');
  });

  test('the repository root itself is the empty path', () => {
    expect(relativeToRepository(repo('C:\\work\\app'), 'c:/work/app/')).toBe('');
  });

  test('is case blind when matching the root but keeps the file spelling', () => {
    expect(relativeToRepository(repo('C:\\Work\\App'), 'c:\\work\\app\\SRC\\Main.TS')).toBe('SRC/Main.TS');
  });
});

describe('repositoryKey', () => {
  test('is the same for every spelling of a root', () => {
    expect(repositoryKey('C:\\Work\\App\\')).toBe(repositoryKey('c:/work/app'));
  });
});

describe('repositoryLabel', () => {
  const projects: Project[] = [
    { root: 'C:\\work\\app', name: 'app' },
    { root: 'D:\\tools', name: 'tools' },
  ];

  test('a project root is just the project name', () => {
    expect(repositoryLabel(repo('C:\\work\\app'), projects)).toBe('app');
  });

  test('a nested repository shows where it is inside the project', () => {
    expect(repositoryLabel(repo('C:\\work\\app\\packages\\lib'), projects)).toBe('app / packages/lib');
  });

  test('a repository above every project falls back to its folder name', () => {
    expect(repositoryLabel(repo('E:\\elsewhere\\big'), projects)).toBe('big');
  });
});
