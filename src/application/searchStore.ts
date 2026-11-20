import { createStore } from 'solid-js/store';
import { indexWorkspace, quickOpen } from './quickOpenStore';
import { ports } from './ports';
import type { LineEnding } from '../domain/fs';

export interface SearchResult { path: string; line: number; column: number; text: string }
export interface SearchState { query: string; results: SearchResult[]; searching: boolean; error: string | null; caseSensitive: boolean; wholeWord: boolean; regex: boolean }
const [state, setState] = createStore<SearchState>({ query: '', results: [], searching: false, error: null, caseSensitive: false, wholeWord: false, regex: false });
export const search: SearchState = state;

export async function runSearch(query = state.query): Promise<void> {
  if (!query) { setState('results', []); return; }
  setState({ query, searching: true, error: null });
  if (!quickOpen.files.length) await indexWorkspace();
  try {
    const flags = state.caseSensitive ? 'g' : 'gi';
    const pattern = state.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(state.wholeWord ? `\\b${pattern}\\b` : pattern, flags);
    const results: SearchResult[] = [];
    for (const path of quickOpen.files) {
      try {
        const content = await ports().fs.readTextFile(path);
        content.text.split('\n').forEach((text, index) => {
          expression.lastIndex = 0;
          const match = expression.exec(text);
          if (match) results.push({ path, line: index + 1, column: match.index + 1, text: text.trim() });
        });
      } catch { /* A file can disappear during a workspace search. */ }
    }
    setState({ results, searching: false });
  } catch (err) { setState({ searching: false, error: String(err) }); }
}

export async function replaceAll(replacement: string): Promise<void> {
  if (!state.query || !state.results.length || !window.confirm(`Replace ${state.query} in ${new Set(state.results.map((r) => r.path)).size} files?`)) return;
  const paths = [...new Set(state.results.map((result) => result.path))];
  const flags = state.caseSensitive ? 'g' : 'gi';
  const pattern = state.regex ? state.query : state.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(state.wholeWord ? `\\b${pattern}\\b` : pattern, flags);
  for (const path of paths) {
    const content = await ports().fs.readTextFile(path);
    const text = content.text.replace(expression, replacement);
    await ports().fs.writeTextFile(path, text, content.lineEnding as LineEnding);
  }
  await runSearch();
}

export function setSearchOption(option: 'caseSensitive' | 'wholeWord' | 'regex', value: boolean): void { setState(option, value); }
