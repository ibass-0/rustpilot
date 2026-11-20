import { describe, expect, test } from 'vitest';
import {
  addProject,
  isInside,
  normalizePath,
  parseStoredProjects,
  projectFor,
  projectName,
  samePath,
  type Project,
} from '../../src/domain/workspace';

describe('paths', () => {
  test('normalizePath uses forward slashes and drops a trailing one', () => {
    expect(normalizePath('C:\\Users\\me\\app\\')).toBe('C:/Users/me/app');
    expect(normalizePath('/home/me/app/')).toBe('/home/me/app');
    expect(normalizePath('C:\\')).toBe('C:');
  });

  test('samePath ignores case and slash style', () => {
    expect(samePath('C:\\Work\\App', 'c:/work/app/')).toBe(true);
    expect(samePath('C:\\Work\\App', 'C:\\Work\\Apps')).toBe(false);
  });

  test('isInside needs a real folder boundary', () => {
    expect(isInside('C:\\a\\b\\c.ts', 'c:/A')).toBe(true);
    expect(isInside('C:\\a', 'C:\\a')).toBe(true);
    expect(isInside('C:\\ab\\c.ts', 'C:\\a')).toBe(false);
    expect(isInside('D:\\a\\b', 'C:\\a')).toBe(false);
  });

  test('paths with spaces and non-ASCII characters work', () => {
    expect(isInside('C:\\My Projects\\café app\\src\\é.ts', 'c:/my projects/CAFÉ APP')).toBe(true);
  });

  test('projectName is the last folder', () => {
    expect(projectName('C:\\work\\shop\\')).toBe('shop');
    expect(projectName('/home/me/api')).toBe('api');
  });
});

describe('projectFor', () => {
  const projects: Project[] = [
    { root: 'C:\\work\\shop', name: 'shop' },
    { root: 'C:\\work\\shop\\packages\\ui', name: 'ui' },
    { root: 'D:\\other', name: 'other' },
  ];

  test('the innermost project wins', () => {
    expect(projectFor(projects, 'C:\\work\\shop\\packages\\ui\\a.ts')?.name).toBe('ui');
    expect(projectFor(projects, 'C:\\work\\shop\\src\\a.ts')?.name).toBe('shop');
  });

  test('a path outside every project has none', () => {
    expect(projectFor(projects, 'E:\\x\\y')).toBeNull();
    expect(projectFor([], 'C:\\work')).toBeNull();
  });

  test('a project root belongs to itself', () => {
    expect(projectFor(projects, 'd:/other')?.name).toBe('other');
  });
});

describe('addProject', () => {
  test('appends a project named after its folder', () => {
    expect(addProject([], 'C:\\work\\shop')).toEqual([{ root: 'C:\\work\\shop', name: 'shop' }]);
  });

  test('the same folder is not added twice, whatever its spelling', () => {
    const once = addProject([], 'C:\\work\\shop');
    expect(addProject(once, 'c:/WORK/shop/')).toEqual(once);
  });

  test('a folder inside or around another project is allowed', () => {
    let projects = addProject([], 'C:\\work\\shop');
    projects = addProject(projects, 'C:\\work\\shop\\packages\\ui');
    projects = addProject(projects, 'C:\\work');
    expect(projects.map((p) => p.name)).toEqual(['shop', 'ui', 'work']);
  });
});

describe('parseStoredProjects', () => {
  test('reads a saved list', () => {
    const raw = JSON.stringify([{ root: 'C:\\a', name: 'a' }, { root: 'C:\\b', name: 'b' }]);
    expect(parseStoredProjects(raw, null).map((p) => p.root)).toEqual(['C:\\a', 'C:\\b']);
  });

  test('damaged data gives no projects', () => {
    expect(parseStoredProjects('{oops', null)).toEqual([]);
    expect(parseStoredProjects('{"a":1}', null)).toEqual([]);
    expect(parseStoredProjects(null, null)).toEqual([]);
  });

  test('entries that are not projects are dropped, and duplicates collapse', () => {
    const raw = JSON.stringify([{ root: 'C:\\a' }, 7, null, { root: 'C:\\a' }, { root: 'c:/A/' }]);
    expect(parseStoredProjects(raw, null)).toEqual([{ root: 'C:\\a', name: 'a' }]);
  });

  test('a workspace saved by an older version becomes one project', () => {
    expect(parseStoredProjects(null, 'C:\\old\\shop')).toEqual([{ root: 'C:\\old\\shop', name: 'shop' }]);
  });

  test('the new list wins over the old single folder', () => {
    const raw = JSON.stringify([{ root: 'C:\\new', name: 'new' }]);
    expect(parseStoredProjects(raw, 'C:\\old')).toEqual([{ root: 'C:\\new', name: 'new' }]);
  });
});
