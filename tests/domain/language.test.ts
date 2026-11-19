import { expect, test } from 'vitest';
import { LANGUAGE_IDS, languageIdFor } from '../../src/domain/language';

test.each([
  // Web
  ['a.js', 'javascript'],
  ['a.mjs', 'javascript'],
  ['a.cjs', 'javascript'],
  ['a.jsx', 'jsx'],
  ['a.ts', 'typescript'],
  ['a.mts', 'typescript'],
  ['a.TSX', 'tsx'],
  ['index.htm', 'html'],
  ['a.css', 'css'],
  ['a.scss', 'scss'],
  ['a.sass', 'sass'],
  ['a.less', 'less'],
  ['App.vue', 'vue'],
  ['a.json', 'json'],
  ['tsconfig.jsonc', 'json'],
  ['a.md', 'markdown'],
  ['a.markdown', 'markdown'],
  // Systems and backend
  ['lib.rs', 'rust'],
  ['main.go', 'go'],
  ['a.c', 'cpp'],
  ['a.h', 'cpp'],
  ['a.cpp', 'cpp'],
  ['a.hpp', 'cpp'],
  ['Main.java', 'java'],
  ['a.kt', 'kotlin'],
  ['a.cs', 'csharp'],
  ['a.php', 'php'],
  ['a.rb', 'ruby'],
  ['a.py', 'python'],
  ['archive.tar.py', 'python'],
  ['a.swift', 'swift'],
  ['a.dart', 'dart'],
  ['a.scala', 'scala'],
  ['a.lua', 'lua'],
  ['a.pl', 'perl'],
  ['a.r', 'r'],
  ['build.gradle', 'groovy'],
  ['a.proto', 'protobuf'],
  // Data and config
  ['a.sql', 'sql'],
  ['a.xml', 'xml'],
  ['logo.svg', 'xml'],
  ['a.yml', 'yaml'],
  ['a.yaml', 'yaml'],
  ['Cargo.toml', 'toml'],
  ['a.ini', 'properties'],
  ['a.properties', 'properties'],
  ['a.diff', 'diff'],
  ['a.patch', 'diff'],
  // Shells
  ['a.sh', 'shell'],
  ['a.bash', 'shell'],
  ['a.zsh', 'shell'],
  ['a.ps1', 'powershell'],
  ['a.psm1', 'powershell'],
])('%s maps to %s by extension', (fileName, id) => {
  expect(languageIdFor(fileName)).toBe(id);
});

test.each([
  ['Dockerfile', 'dockerfile'],
  ['dockerfile', 'dockerfile'],
  ['api.dockerfile', 'dockerfile'],
  ['Cargo.lock', 'toml'],
  ['Gemfile', 'ruby'],
  ['Rakefile', 'ruby'],
  ['CMakeLists.txt', 'cmake'],
  ['toolchain.cmake', 'cmake'],
  ['nginx.conf', 'nginx'],
  ['.env', 'properties'],
  ['.env.local', 'properties'],
  ['.editorconfig', 'properties'],
  ['.gitconfig', 'properties'],
  ['.bashrc', 'shell'],
  ['.zshrc', 'shell'],
  ['.npmrc', 'properties'],
])('%s maps to %s by file name', (fileName, id) => {
  expect(languageIdFor(fileName)).toBe(id);
});

test.each(['a.xyz', 'Makefile', '.gitignore', 'notes.txt', 'photo.png', 'LICENSE', ''])(
  '"%s" has no language',
  (fileName) => {
    expect(languageIdFor(fileName)).toBeNull();
  },
);

test('every language id is reachable from at least one file name', () => {
  const samples = [
    'a.js', 'a.jsx', 'a.ts', 'a.tsx', 'a.html', 'a.css', 'a.scss', 'a.sass', 'a.less', 'a.vue', 'a.json', 'a.md',
    'a.rs', 'a.go', 'a.cpp', 'a.java', 'a.kt', 'a.cs', 'a.php', 'a.rb', 'a.py', 'a.swift', 'a.dart', 'a.scala',
    'a.lua', 'a.pl', 'a.r', 'a.groovy', 'a.proto', 'a.sql', 'a.xml', 'a.yaml', 'a.toml', 'a.ini', 'a.diff',
    'a.sh', 'a.ps1', 'Dockerfile', 'a.cmake', 'nginx.conf',
  ];
  const reached = new Set(samples.map(languageIdFor));
  expect(LANGUAGE_IDS.filter((id) => !reached.has(id))).toEqual([]);
});
