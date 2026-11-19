import { expect, test } from 'vitest';
import { languageIdFor } from '../../../src/domain/language';
import { languageFor } from '../../../src/infrastructure/codemirror/languages';

test.each(['a.ts', 'a.TSX', 'a.rs', 'a.json', 'a.html', 'a.css', 'a.md', 'a.py'])('%s has a language', async (f) => {
  expect(await languageFor(f)).not.toBeNull();
});

test.each(['a.xyz', 'Makefile', '.gitignore'])('%s has no language', async (f) => {
  expect(await languageFor(f)).toBeNull();
});

test.each([
  ['a.js', 'javascript'],
  ['a.mjs', 'javascript'],
  ['a.cjs', 'javascript'],
  ['a.jsx', 'jsx'],
  ['a.ts', 'typescript'],
  ['a.TSX', 'tsx'],
  ['lib.rs', 'rust'],
  ['index.htm', 'html'],
  ['archive.tar.py', 'python'],
])('%s maps to %s', (fileName, id) => {
  expect(languageIdFor(fileName)).toBe(id);
});
