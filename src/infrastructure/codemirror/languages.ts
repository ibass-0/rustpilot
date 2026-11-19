import type { Extension } from '@codemirror/state';
import { languageIdFor, type LanguageId } from '../../domain/language';

// Each language package is its own lazy chunk, fetched the first time a file of that type opens.
const LOADERS: Record<LanguageId, () => Promise<Extension>> = {
  javascript: async () => (await import('@codemirror/lang-javascript')).javascript(),
  jsx: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true }),
  typescript: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true }),
  tsx: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true }),
  rust: async () => (await import('@codemirror/lang-rust')).rust(),
  json: async () => (await import('@codemirror/lang-json')).json(),
  html: async () => (await import('@codemirror/lang-html')).html(),
  css: async () => (await import('@codemirror/lang-css')).css(),
  markdown: async () => (await import('@codemirror/lang-markdown')).markdown(),
  python: async () => (await import('@codemirror/lang-python')).python(),
};

/** The syntax extension for a file name, or `null` when the language is not supported. */
export async function languageFor(fileName: string): Promise<Extension | null> {
  const id = languageIdFor(fileName);
  return id ? LOADERS[id]() : null;
}
