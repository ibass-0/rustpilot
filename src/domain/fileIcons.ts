/** Colour families for icons; the presentation layer maps each to a CSS variable. */
export type IconTint = 'blue' | 'yellow' | 'orange' | 'red' | 'green' | 'purple' | 'teal' | 'pink' | 'gray';

/** Pictograms drawn as shapes rather than as a lettered badge. */
export type IconShape = 'file' | 'text' | 'image' | 'lock' | 'gear' | 'git' | 'terminal' | 'database' | 'archive';

export type FileIcon =
  | { shape: 'badge'; label: string; tint: IconTint }
  | { shape: IconShape; tint: IconTint };

export interface FolderIcon {
  /** `folder` is the ordinary folder colour; `faint` dims folders nobody browses. */
  tint: IconTint | 'folder' | 'faint';
}

const badge = (label: string, tint: IconTint): FileIcon => ({ shape: 'badge', label, tint });
const pictogram = (shape: IconShape, tint: IconTint): FileIcon => ({ shape, tint });

const PLAIN_FILE: FileIcon = pictogram('file', 'gray');

const BY_NAME: Record<string, FileIcon> = {
  dockerfile: badge('DK', 'blue'),
  makefile: pictogram('gear', 'orange'),
  license: pictogram('text', 'yellow'),
  licence: pictogram('text', 'yellow'),
  '.editorconfig': pictogram('gear', 'gray'),
  '.npmrc': pictogram('gear', 'gray'),
  '.gitignore': pictogram('git', 'red'),
  '.gitattributes': pictogram('git', 'red'),
  '.gitmodules': pictogram('git', 'red'),
  '.gitkeep': pictogram('git', 'red'),
  'yarn.lock': pictogram('lock', 'gray'),
};

const BY_EXTENSION: Record<string, FileIcon> = {};

function register(icon: FileIcon, ...extensions: string[]): void {
  for (const extension of extensions) BY_EXTENSION[extension] = icon;
}

register(badge('TS', 'blue'), 'ts', 'tsx', 'mts', 'cts');
register(badge('JS', 'yellow'), 'js', 'jsx', 'mjs', 'cjs');
register(badge('RS', 'orange'), 'rs');
register(badge('PY', 'teal'), 'py');
register(badge('GO', 'teal'), 'go');
register(badge('{}', 'yellow'), 'json', 'jsonc');
register(badge('<>', 'orange'), 'html', 'htm');
register(badge('<>', 'green'), 'xml', 'xsd', 'plist');
register(badge('#', 'purple'), 'css');
register(badge('#', 'pink'), 'scss', 'sass', 'less');
register(badge('M', 'teal'), 'md', 'markdown');
register(badge('V', 'green'), 'vue');
register(badge('S', 'orange'), 'svelte');
register(badge('J', 'red'), 'java');
register(badge('C#', 'green'), 'cs');
register(badge('C+', 'blue'), 'cpp', 'cc', 'cxx', 'hpp');
register(badge('C', 'blue'), 'c');
register(badge('H', 'blue'), 'h');
register(badge('PH', 'purple'), 'php');
register(badge('RB', 'red'), 'rb');
register(badge('KT', 'purple'), 'kt', 'kts');
register(badge('SW', 'orange'), 'swift');
register(badge('DT', 'teal'), 'dart');
register(badge('LU', 'blue'), 'lua');
register(badge('DK', 'blue'), 'dockerfile');
register(badge('Aa', 'gray'), 'ttf', 'otf', 'woff', 'woff2');
register(pictogram('image', 'purple'), 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'icns', 'svg', 'avif');
register(pictogram('lock', 'gray'), 'lock');
register(pictogram('gear', 'gray'), 'toml', 'yaml', 'yml', 'ini', 'conf', 'cfg', 'properties');
register(pictogram('terminal', 'green'), 'sh', 'bash', 'zsh', 'fish');
register(pictogram('terminal', 'blue'), 'ps1', 'psm1', 'psd1');
register(pictogram('terminal', 'gray'), 'bat', 'cmd');
register(pictogram('database', 'blue'), 'sql', 'db', 'sqlite', 'sqlite3');
register(pictogram('archive', 'yellow'), 'zip', 'tar', 'gz', 'tgz', '7z', 'rar');
register(pictogram('text', 'gray'), 'txt', 'log');
register(pictogram('text', 'red'), 'pdf');

/** `pnpm-lock.yaml`, `package-lock.json` and friends: generated, not for reading. */
const LOCK_FILE = /-lock\.(json|ya?ml)$/;

/** The icon for a file, chosen by its whole name first and its extension second. */
export function fileIconFor(fileName: string): FileIcon {
  const name = fileName.toLowerCase();
  const byName = BY_NAME[name];
  if (byName) return byName;
  if (LOCK_FILE.test(name)) return pictogram('lock', 'gray');
  if (name === '.env' || name.startsWith('.env.')) return pictogram('gear', 'yellow');

  const dot = name.lastIndexOf('.');
  if (dot <= 0) return PLAIN_FILE;
  return BY_EXTENSION[name.slice(dot + 1)] ?? PLAIN_FILE;
}

const FOLDER_TINTS: Record<string, FolderIcon['tint']> = {};

function registerFolders(tint: FolderIcon['tint'], ...names: string[]): void {
  for (const name of names) FOLDER_TINTS[name] = tint;
}

registerFolders('blue', 'src', 'source', 'lib', 'app', '.vscode', '.idea');
registerFolders('green', 'test', 'tests', '__tests__', 'spec', 'e2e', 'scripts', 'bin', 'tools');
registerFolders('faint', 'node_modules', 'vendor', '.pnpm-store');
registerFolders('orange', 'dist', 'build', 'out', 'target', 'coverage', 'installer', '.next');
registerFolders('red', '.git', '.github');
registerFolders('teal', 'docs', 'doc');
registerFolders('purple', 'assets', 'public', 'static', 'images', 'img', 'icons', 'fonts');
registerFolders('gray', 'config', 'configs', '.config', 'settings');

/** The tint for a folder: well-known folder names get their own colour. */
export function folderIconFor(folderName: string): FolderIcon {
  return { tint: FOLDER_TINTS[folderName.toLowerCase()] ?? 'folder' };
}
