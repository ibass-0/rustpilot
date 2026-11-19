import { expect, test } from 'vitest';
import { fileIconFor, folderIconFor } from '../../src/domain/fileIcons';

test.each([
  ['main.ts', { shape: 'badge', label: 'TS', tint: 'blue' }],
  ['App.tsx', { shape: 'badge', label: 'TS', tint: 'blue' }],
  ['index.js', { shape: 'badge', label: 'JS', tint: 'yellow' }],
  ['lib.rs', { shape: 'badge', label: 'RS', tint: 'orange' }],
  ['app.py', { shape: 'badge', label: 'PY', tint: 'teal' }],
  ['main.go', { shape: 'badge', label: 'GO', tint: 'teal' }],
  ['package.json', { shape: 'badge', label: '{}', tint: 'yellow' }],
  ['index.html', { shape: 'badge', label: '<>', tint: 'orange' }],
  ['styles.css', { shape: 'badge', label: '#', tint: 'purple' }],
  ['theme.scss', { shape: 'badge', label: '#', tint: 'pink' }],
  ['README.md', { shape: 'badge', label: 'M', tint: 'teal' }],
  ['App.vue', { shape: 'badge', label: 'V', tint: 'green' }],
  ['Main.java', { shape: 'badge', label: 'J', tint: 'red' }],
  ['a.cs', { shape: 'badge', label: 'C#', tint: 'green' }],
  ['a.cpp', { shape: 'badge', label: 'C+', tint: 'blue' }],
  ['a.c', { shape: 'badge', label: 'C', tint: 'blue' }],
  ['a.php', { shape: 'badge', label: 'PH', tint: 'purple' }],
  ['a.rb', { shape: 'badge', label: 'RB', tint: 'red' }],
  ['a.kt', { shape: 'badge', label: 'KT', tint: 'purple' }],
  ['a.swift', { shape: 'badge', label: 'SW', tint: 'orange' }],
  ['Dockerfile', { shape: 'badge', label: 'DK', tint: 'blue' }],
  ['font.woff2', { shape: 'badge', label: 'Aa', tint: 'gray' }],
])('%s gets a labelled badge', (name, icon) => {
  expect(fileIconFor(name)).toEqual(icon);
});

test.each([
  ['photo.PNG', { shape: 'image', tint: 'purple' }],
  ['logo.svg', { shape: 'image', tint: 'purple' }],
  ['icon.ico', { shape: 'image', tint: 'purple' }],
  ['pnpm-lock.yaml', { shape: 'lock', tint: 'gray' }],
  ['Cargo.lock', { shape: 'lock', tint: 'gray' }],
  ['package-lock.json', { shape: 'lock', tint: 'gray' }],
  ['yarn.lock', { shape: 'lock', tint: 'gray' }],
  ['Cargo.toml', { shape: 'gear', tint: 'gray' }],
  ['config.yaml', { shape: 'gear', tint: 'gray' }],
  ['.env', { shape: 'gear', tint: 'yellow' }],
  ['.env.production', { shape: 'gear', tint: 'yellow' }],
  ['.editorconfig', { shape: 'gear', tint: 'gray' }],
  ['Makefile', { shape: 'gear', tint: 'orange' }],
  ['.gitignore', { shape: 'git', tint: 'red' }],
  ['.gitattributes', { shape: 'git', tint: 'red' }],
  ['run.sh', { shape: 'terminal', tint: 'green' }],
  ['build.ps1', { shape: 'terminal', tint: 'blue' }],
  ['run.bat', { shape: 'terminal', tint: 'gray' }],
  ['schema.sql', { shape: 'database', tint: 'blue' }],
  ['data.sqlite', { shape: 'database', tint: 'blue' }],
  ['bundle.zip', { shape: 'archive', tint: 'yellow' }],
  ['notes.txt', { shape: 'text', tint: 'gray' }],
  ['error.log', { shape: 'text', tint: 'gray' }],
  ['LICENSE', { shape: 'text', tint: 'yellow' }],
])('%s gets a pictogram', (name, icon) => {
  expect(fileIconFor(name)).toEqual(icon);
});

test.each(['mystery.xyz', 'noextension', ''])('"%s" falls back to the plain file icon', (name) => {
  expect(fileIconFor(name)).toEqual({ shape: 'file', tint: 'gray' });
});

test('a lock file wins over its extension', () => {
  expect(fileIconFor('pnpm-lock.yaml').shape).toBe('lock');
  expect(fileIconFor('config.yaml').shape).toBe('gear');
});

test.each([
  ['src', 'blue'],
  ['lib', 'blue'],
  ['tests', 'green'],
  ['__tests__', 'green'],
  ['node_modules', 'faint'],
  ['dist', 'orange'],
  ['target', 'orange'],
  ['build', 'orange'],
  ['.git', 'red'],
  ['.github', 'red'],
  ['.vscode', 'blue'],
  ['.idea', 'blue'],
  ['docs', 'teal'],
  ['assets', 'purple'],
  ['public', 'purple'],
  ['scripts', 'green'],
  ['config', 'gray'],
  ['SRC', 'blue'],
])('folder "%s" is tinted %s', (name, tint) => {
  expect(folderIconFor(name)).toEqual({ tint });
});

test('an ordinary folder gets the default tint', () => {
  expect(folderIconFor('whatever')).toEqual({ tint: 'folder' });
});
