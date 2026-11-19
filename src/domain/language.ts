export type LanguageId =
  | 'javascript'
  | 'jsx'
  | 'typescript'
  | 'tsx'
  | 'rust'
  | 'json'
  | 'html'
  | 'css'
  | 'markdown'
  | 'python';

const BY_EXTENSION: Record<string, LanguageId> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  rs: 'rust',
  json: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  md: 'markdown',
  py: 'python',
};

/** The language for a file name, chosen by its extension case-insensitively. `null` when unknown. */
export function languageIdFor(fileName: string): LanguageId | null {
  const dot = fileName.lastIndexOf('.');
  // No dot, or a dotfile such as `.gitignore`: there is no extension.
  if (dot <= 0) return null;
  return BY_EXTENSION[fileName.slice(dot + 1).toLowerCase()] ?? null;
}
