import { expect, test } from 'vitest';
import { fileIconName, folderIconName, type IconManifest } from '../../src/domain/fileIcons';

const manifest: IconManifest = {
  file: 'file',
  folder: 'folder',
  rootFolder: 'folder-root',
  files: { 'package.json': 'nodejs', dockerfile: 'docker', '.gitignore': 'git' },
  extensions: { ts: 'typescript', 'spec.ts': 'test-ts', 'd.ts': 'typescript-def', json: 'json', md: 'markdown' },
  folders: { src: 'folder-src', test: 'folder-test', git: 'folder-git' },
};

test.each([
  ['main.ts', 'typescript'],
  ['MAIN.TS', 'typescript'],
  ['data.json', 'json'],
  ['README.md', 'markdown'],
])('%s is matched by its extension', (name, icon) => {
  expect(fileIconName(manifest, name)).toBe(icon);
});

test('a whole-name match wins over the extension', () => {
  expect(fileIconName(manifest, 'package.json')).toBe('nodejs');
  expect(fileIconName(manifest, 'Package.JSON')).toBe('nodejs');
});

test('the longest matching extension wins', () => {
  expect(fileIconName(manifest, 'app.spec.ts')).toBe('test-ts');
  expect(fileIconName(manifest, 'types.d.ts')).toBe('typescript-def');
  expect(fileIconName(manifest, 'a.b.c.ts')).toBe('typescript');
});

test('names without an extension are matched whole', () => {
  expect(fileIconName(manifest, 'Dockerfile')).toBe('docker');
  expect(fileIconName(manifest, '.gitignore')).toBe('git');
});

test.each(['mystery.xyz', 'noextension', '.hidden', ''])('"%s" falls back to the default file icon', (name) => {
  expect(fileIconName(manifest, name)).toBe('file');
});

test('a folder gets its own icon, with an open variant', () => {
  expect(folderIconName(manifest, 'src', false)).toBe('folder-src');
  expect(folderIconName(manifest, 'src', true)).toBe('folder-src-open');
  expect(folderIconName(manifest, 'SRC', false)).toBe('folder-src');
});

test.each(['.git', '_test', '__test__', '.test', '__TEST__'])('folder "%s" is matched without its decoration', (name) => {
  const expected = name.toLowerCase().includes('git') ? 'folder-git' : 'folder-test';
  expect(folderIconName(manifest, name, false)).toBe(expected);
});

test('an ordinary folder gets the default folder icon', () => {
  expect(folderIconName(manifest, 'whatever', false)).toBe('folder');
  expect(folderIconName(manifest, 'whatever', true)).toBe('folder-open');
});

test('the workspace root has its own icon', () => {
  expect(folderIconName(manifest, 'src', false, true)).toBe('folder-root');
  expect(folderIconName(manifest, 'src', true, true)).toBe('folder-root-open');
});
