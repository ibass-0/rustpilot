import { expect, test } from 'vitest';
import { LANGUAGE_IDS } from '../../../src/domain/language';
import { languageFor, loadLanguage } from '../../../src/infrastructure/codemirror/languages';

test.each([...LANGUAGE_IDS])('the %s language package loads', async (id) => {
  expect(await loadLanguage(id)).toBeTruthy();
});

test.each(['a.ts', 'a.TSX', 'a.rs', 'a.json', 'a.html', 'a.css', 'a.md', 'a.py', 'Dockerfile', 'a.sh', 'a.yaml'])(
  '%s has a language',
  async (f) => {
    expect(await languageFor(f)).not.toBeNull();
  },
);

test.each(['a.xyz', 'Makefile', '.gitignore'])('%s has no language', async (f) => {
  expect(await languageFor(f)).toBeNull();
});
