import { expect, test } from 'vitest';
import upstream from '../../../node_modules/material-icon-theme/dist/material-icons.json';
import { fileIconName, folderIconName } from '../../../src/domain/fileIcons';
import { iconUrl, materialManifest } from '../../../src/infrastructure/material/icons';

const definitions: Record<string, { iconPath: string }> = upstream.iconDefinitions;
/** Every drawing the icon package ships, by file name. */
const shipped = new Set(
  Object.keys(import.meta.glob('../../../node_modules/material-icon-theme/icons/*.svg')).map((file) =>
    file.slice(file.lastIndexOf('/') + 1),
  ),
);

/** Whether the icon package really ships a drawing for this icon name. */
function hasDrawing(name: string): boolean {
  const definition = definitions[name];
  return definition !== undefined && shipped.has(definition.iconPath.slice(definition.iconPath.lastIndexOf('/') + 1));
}

test.each([
  ['main.ts', 'typescript'],
  ['App.tsx', 'react_ts'],
  ['index.js', 'javascript'],
  ['lib.rs', 'rust'],
  ['index.html', 'html'],
  ['styles.css', 'css'],
  ['data.json', 'json'],
  ['notes.md', 'markdown'],
  ['app.py', 'python'],
  ['main.go', 'go'],
  ['run.sh', 'console'],
  ['build.ps1', 'powershell'],
  ['config.yaml', 'yaml'],
  ['Cargo.toml', 'toml'],
  ['package.json', 'nodejs'],
  ['tsconfig.json', 'tsconfig'],
  ['vite.config.ts', 'vite'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['Dockerfile', 'docker'],
  ['Makefile', 'makefile'],
  ['.gitignore', 'git'],
  ['README.md', 'readme'],
  ['LICENSE', 'license'],
  ['photo.png', 'image'],
  ['logo.svg', 'svg'],
])('%s uses the Material "%s" icon', (name, icon) => {
  expect(fileIconName(materialManifest, name)).toBe(icon);
});

test.each([
  ['src', 'folder-src'],
  ['tests', 'folder-test'],
  ['node_modules', 'folder-node'],
  ['dist', 'folder-dist'],
  ['.git', 'folder-git'],
  ['docs', 'folder-docs'],
  ['assets', 'folder-resource'],
  ['scripts', 'folder-scripts'],
  ['.vscode', 'folder-vscode'],
  ['target', 'folder-target'],
])('folder %s uses the Material "%s" icon', (name, icon) => {
  expect(folderIconName(materialManifest, name, false)).toBe(icon);
  expect(folderIconName(materialManifest, name, true)).toBe(`${icon}-open`);
});

test('every icon the manifest can return exists in the icon package', () => {
  const names = new Set<string>([
    materialManifest.file,
    materialManifest.folder,
    `${materialManifest.folder}-open`,
    materialManifest.rootFolder,
    `${materialManifest.rootFolder}-open`,
    ...Object.values(materialManifest.files),
    ...Object.values(materialManifest.extensions),
    ...Object.values(materialManifest.folders).flatMap((folder) => [folder, `${folder}-open`]),
  ]);
  const missing = [...names].filter((name) => !hasDrawing(name));
  expect(missing).toEqual([]);
});

test('icon urls point into the static icon folder', () => {
  expect(iconUrl('typescript')).toBe('/material-icons/typescript.svg');
});
