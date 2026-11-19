// Prepares the Material Icon Theme (MIT, https://github.com/material-extensions/vscode-material-icon-theme)
// for the app:
//   1. writes a compact lookup table to src/infrastructure/material/manifest.generated.json
//   2. copies the icons that table can name to public/material-icons/
// Runs before `vite` and `vite build`; safe to run any time.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pkgDir = path.join(root, 'node_modules', 'material-icon-theme');
const source = JSON.parse(fs.readFileSync(path.join(pkgDir, 'dist', 'material-icons.json'), 'utf8'));
const version = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version;

// The upstream manifest leaves common extensions to VS Code's language detection.
// These fill the gaps, each only when the extension has no icon of its own.
const LANGUAGE_OF_EXTENSION = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascriptreact',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescriptreact',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', sass: 'sass', less: 'less', vue: 'vue',
  json: 'json', jsonc: 'json', md: 'markdown', markdown: 'markdown',
  rs: 'rust', go: 'go', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  java: 'java', cs: 'csharp', php: 'php', rb: 'ruby', py: 'python', swift: 'swift', dart: 'dart',
  scala: 'scala', lua: 'lua', pl: 'perl', pm: 'perl', r: 'r', groovy: 'groovy', gradle: 'groovy',
  proto: 'proto', sql: 'sql', xml: 'xml', yml: 'yaml', yaml: 'yaml', toml: 'toml',
  ini: 'ini', properties: 'properties', diff: 'diff', patch: 'diff',
  sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', ps1: 'powershell', psm1: 'powershell',
  bat: 'bat', cmd: 'bat',
};

const lower = (record) => Object.fromEntries(Object.entries(record).map(([key, icon]) => [key.toLowerCase(), icon]));

const files = lower(source.fileNames);
const extensions = lower(source.fileExtensions);
for (const [extension, language] of Object.entries(LANGUAGE_OF_EXTENSION)) {
  const icon = source.languageIds[language];
  if (icon && !extensions[extension]) extensions[extension] = icon;
}

/** `.git`, `_test` and `__test__` are decorations of `git` and `test`; the app strips them at lookup time. */
function undecorated(name) {
  const dunder = /^__(.+)__$/.exec(name);
  if (dunder) return dunder[1];
  return name.startsWith('.') || name.startsWith('_') ? name.slice(1) : name;
}

const allFolders = lower(source.folderNames);
const expandedFolders = lower(source.folderNamesExpanded);
const folders = {};
for (const [name, icon] of Object.entries(allFolders)) {
  if (expandedFolders[name] !== `${icon}-open`) {
    throw new Error(`Folder icon "${icon}" has no "-open" twin (folder "${name}"); the lookup rule needs updating.`);
  }
  const plain = undecorated(name);
  // Keep a decorated name only when stripping it would give a different answer.
  if (plain === name || allFolders[plain] !== icon) folders[name] = icon;
}
for (const [key, expected] of [['folder', source.folderExpanded], ['rootFolder', source.rootFolderExpanded]]) {
  if (expected !== `${source[key]}-open`) throw new Error(`Default ${key} icon has no "-open" twin.`);
}

const manifest = { file: source.file, folder: source.folder, rootFolder: source.rootFolder, files, extensions, folders };

const sortKeys = (record) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
manifest.files = sortKeys(files);
manifest.extensions = sortKeys(extensions);
manifest.folders = sortKeys(folders);

const manifestPath = path.join(root, 'src', 'infrastructure', 'material', 'manifest.generated.json');
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
const serialized = `${JSON.stringify(manifest)}\n`;
if (!fs.existsSync(manifestPath) || fs.readFileSync(manifestPath, 'utf8') !== serialized) {
  fs.writeFileSync(manifestPath, serialized);
}

const names = new Set([
  manifest.file,
  manifest.folder,
  `${manifest.folder}-open`,
  manifest.rootFolder,
  `${manifest.rootFolder}-open`,
  ...Object.values(files),
  ...Object.values(extensions),
  ...Object.values(folders).flatMap((icon) => [icon, `${icon}-open`]),
]);

const outDir = path.join(root, 'public', 'material-icons');
const stampPath = path.join(outDir, '.version');
const stamp = `${version}:${names.size}`;
if (!fs.existsSync(stampPath) || fs.readFileSync(stampPath, 'utf8') !== stamp) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  let bytes = 0;
  for (const name of names) {
    // An icon's file is not always named after it (clones are `<name>.clone.svg`).
    const definition = source.iconDefinitions[name];
    if (!definition) throw new Error(`The manifest names an icon with no definition: ${name}`);
    const from = path.join(pkgDir, 'icons', path.basename(definition.iconPath));
    fs.copyFileSync(from, path.join(outDir, `${name}.svg`));
    bytes += fs.statSync(from).size;
  }
  fs.writeFileSync(stampPath, stamp);
  console.log(`Material icons ${version}: copied ${names.size} icons (${(bytes / 1024).toFixed(0)} KB), manifest ${(serialized.length / 1024).toFixed(0)} KB.`);
}
