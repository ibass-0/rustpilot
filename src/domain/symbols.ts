export type SymbolKind = 'function' | 'class' | 'type' | 'module' | 'heading' | 'section';

export interface DocumentSymbol { name: string; kind: SymbolKind; line: number; depth: number; }

const patterns: Array<[RegExp, SymbolKind]> = [
  [/^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_$][\w$]*)/, 'function'],
  [/^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_$][\w$]*)/, 'type'],
  [/^\s*(?:impl|mod)\s+([A-Za-z_$][\w$]*)/, 'module'],
  [/^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/, 'class'],
  [/^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/, 'type'],
  [/^\s*(?:export\s+)?(?:type|const|let|var)\s+([A-Za-z_$][\w$]*)/, 'type'],
  [/^\s*(?:async\s+)?def\s+([A-Za-z_$][\w$]*)\s*\(/, 'function'],
];

export function symbolsFor(text: string, fileName: string): DocumentSymbol[] {
  const lines = text.split(/\r?\n/);
  const result: DocumentSymbol[] = [];
  lines.forEach((line, index) => {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading && /\.md$/i.test(fileName)) { result.push({ name: heading[2], kind: heading[1].length === 1 ? 'heading' : 'section', line: index + 1, depth: heading[1].length - 1 }); return; }
    for (const [pattern, kind] of patterns) { const match = pattern.exec(line); if (match) { result.push({ name: match[1], kind, line: index + 1, depth: Math.floor(line.search(/\S|$/) / 2) }); break; } }
  });
  return result;
}
