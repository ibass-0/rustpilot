import { expect, test } from 'vitest';
import { appInfo } from '../../src/domain/appInfo';

test('describes the application and carries the version it is given', () => {
  const info = appInfo('1.2.3');
  expect(info.name).toBe('RustPilot');
  expect(info.version).toBe('1.2.3');
  expect(info.description.length).toBeGreaterThan(20);
});

test('names the author with contact details', () => {
  expect(appInfo('0.1.0').author).toEqual({
    name: 'Indra Basuki',
    email: 'indrbasuki1@gmail.com',
    github: 'https://github.com/ibass-0',
  });
});

test('credits the open source projects the app is built on, each with a licence', () => {
  const credits = appInfo('0.1.0').credits;
  expect(credits.map((credit) => credit.name)).toEqual(
    expect.arrayContaining(['Tauri', 'SolidJS', 'CodeMirror', 'Material Icon Theme']),
  );
  expect(credits.every((credit) => credit.license.length > 0)).toBe(true);
});
