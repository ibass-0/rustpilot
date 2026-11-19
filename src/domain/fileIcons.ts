/**
 * The lookup table of an icon theme: which icon each file name, extension
 * and folder name gets. Icons are identified by name; turning a name into
 * something drawable is the presentation layer's business.
 */
export interface IconManifest {
  /** Icon for a file nothing else matches. */
  file: string;
  /** Icon for a folder nothing else matches; `-open` is appended when it is expanded. */
  folder: string;
  /** Icon for the workspace root. */
  rootFolder: string;
  /** Whole file names, lower-cased. */
  files: Record<string, string>;
  /** Extensions without the leading dot, lower-cased; may contain dots (`spec.ts`). */
  extensions: Record<string, string>;
  /** Folder names, lower-cased. */
  folders: Record<string, string>;
}

/**
 * The icon for a file. A whole-name match wins; otherwise the longest
 * extension that has an icon (`a.spec.ts` tries `spec.ts` before `ts`).
 */
export function fileIconName(manifest: IconManifest, fileName: string): string {
  const name = fileName.toLowerCase();
  const byName = manifest.files[name];
  if (byName) return byName;

  // Start after the first character so that a dotfile's own name is not treated as an extension.
  for (let dot = name.indexOf('.', 1); dot !== -1; dot = name.indexOf('.', dot + 1)) {
    const byExtension = manifest.extensions[name.slice(dot + 1)];
    if (byExtension) return byExtension;
  }
  return manifest.file;
}

/** `.git`, `_test` and `__test__` are looked up as `git` and `test` when they have no icon of their own. */
function undecorated(name: string): string {
  const dunder = /^__(.+)__$/.exec(name);
  if (dunder) return dunder[1];
  return name.startsWith('.') || name.startsWith('_') ? name.slice(1) : name;
}

/** The icon for a folder, in its open form when `open` is set. */
export function folderIconName(manifest: IconManifest, folderName: string, open: boolean, isRoot = false): string {
  const name = folderName.toLowerCase();
  const icon = isRoot
    ? manifest.rootFolder
    : (manifest.folders[name] ?? manifest.folders[undecorated(name)] ?? manifest.folder);
  return open ? `${icon}-open` : icon;
}
