import { StreamLanguage, type StreamParser } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { languageIdFor, type LanguageId } from '../../domain/language';

/** Wrap a legacy CodeMirror 5 mode as a CodeMirror 6 language. */
const legacy = (parser: StreamParser<unknown>): Extension => StreamLanguage.define(parser);

// Each language package is its own lazy chunk, fetched the first time a file of that type opens.
const LOADERS: Record<LanguageId, () => Promise<Extension>> = {
  javascript: async () => (await import('@codemirror/lang-javascript')).javascript(),
  jsx: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true }),
  typescript: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true }),
  tsx: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true }),
  html: async () => (await import('@codemirror/lang-html')).html(),
  css: async () => (await import('@codemirror/lang-css')).css(),
  scss: async () => (await import('@codemirror/lang-sass')).sass(),
  sass: async () => (await import('@codemirror/lang-sass')).sass({ indented: true }),
  less: async () => (await import('@codemirror/lang-less')).less(),
  vue: async () => (await import('@codemirror/lang-vue')).vue(),
  json: async () => (await import('@codemirror/lang-json')).json(),
  markdown: async () => (await import('@codemirror/lang-markdown')).markdown(),
  rust: async () => (await import('@codemirror/lang-rust')).rust(),
  go: async () => (await import('@codemirror/lang-go')).go(),
  cpp: async () => (await import('@codemirror/lang-cpp')).cpp(),
  java: async () => (await import('@codemirror/lang-java')).java(),
  php: async () => (await import('@codemirror/lang-php')).php(),
  python: async () => (await import('@codemirror/lang-python')).python(),
  sql: async () => (await import('@codemirror/lang-sql')).sql(),
  xml: async () => (await import('@codemirror/lang-xml')).xml(),
  yaml: async () => (await import('@codemirror/lang-yaml')).yaml(),
  kotlin: async () => legacy((await import('@codemirror/legacy-modes/mode/clike')).kotlin),
  csharp: async () => legacy((await import('@codemirror/legacy-modes/mode/clike')).csharp),
  dart: async () => legacy((await import('@codemirror/legacy-modes/mode/clike')).dart),
  scala: async () => legacy((await import('@codemirror/legacy-modes/mode/clike')).scala),
  ruby: async () => legacy((await import('@codemirror/legacy-modes/mode/ruby')).ruby),
  swift: async () => legacy((await import('@codemirror/legacy-modes/mode/swift')).swift),
  lua: async () => legacy((await import('@codemirror/legacy-modes/mode/lua')).lua),
  perl: async () => legacy((await import('@codemirror/legacy-modes/mode/perl')).perl),
  r: async () => legacy((await import('@codemirror/legacy-modes/mode/r')).r),
  groovy: async () => legacy((await import('@codemirror/legacy-modes/mode/groovy')).groovy),
  protobuf: async () => legacy((await import('@codemirror/legacy-modes/mode/protobuf')).protobuf),
  toml: async () => legacy((await import('@codemirror/legacy-modes/mode/toml')).toml),
  properties: async () => legacy((await import('@codemirror/legacy-modes/mode/properties')).properties),
  diff: async () => legacy((await import('@codemirror/legacy-modes/mode/diff')).diff),
  shell: async () => legacy((await import('@codemirror/legacy-modes/mode/shell')).shell),
  powershell: async () => legacy((await import('@codemirror/legacy-modes/mode/powershell')).powerShell),
  dockerfile: async () => legacy((await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile),
  cmake: async () => legacy((await import('@codemirror/legacy-modes/mode/cmake')).cmake),
  nginx: async () => legacy((await import('@codemirror/legacy-modes/mode/nginx')).nginx),
};

export function loadLanguage(id: LanguageId): Promise<Extension> {
  return LOADERS[id]();
}

/** The syntax extension for a file name, or `null` when the language is not supported. */
export async function languageFor(fileName: string): Promise<Extension | null> {
  const id = languageIdFor(fileName);
  return id ? loadLanguage(id) : null;
}
