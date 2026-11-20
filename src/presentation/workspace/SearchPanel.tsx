import { For, Show, type JSX } from 'solid-js';
import { replaceAll, runSearch, search, setSearchOption } from '../../application/searchStore';
import { fileNameOf } from '../../domain/fs';

export function SearchPanel(props: { onOpen: (path: string, line: number) => void }): JSX.Element {
  return <div class="search-panel">
    <div class="search-controls">
      <input class="search-input" value={search.query} placeholder="Search in files" onInput={(event) => { void runSearch(event.currentTarget.value); }} />
      <div class="search-options">
        <label><input type="checkbox" checked={search.caseSensitive} onChange={(event) => setSearchOption('caseSensitive', event.currentTarget.checked)} /> Aa</label>
        <label><input type="checkbox" checked={search.wholeWord} onChange={(event) => setSearchOption('wholeWord', event.currentTarget.checked)} /> Word</label>
        <label><input type="checkbox" checked={search.regex} onChange={(event) => setSearchOption('regex', event.currentTarget.checked)} /> .* </label>
        <button type="button" class="button" disabled={!search.results.length} onClick={() => void replaceAll(window.prompt('Replace with:', '') ?? '')}>Replace All</button>
      </div>
    </div>
    <Show when={!search.searching} fallback={<div class="empty-state">Searching…</div>}>
      <Show when={!search.error} fallback={<div class="empty-state">{search.error}</div>}>
        <div class="search-results"><For each={search.results}>
          {(result) => <button type="button" class="search-result" onClick={() => props.onOpen(result.path, result.line)}>
            <span class="search-result-file">{fileNameOf(result.path)} <small>{result.line}:{result.column}</small></span>
            <span class="search-result-path">{result.path}</span><span class="search-result-text">{result.text}</span>
          </button>}
        </For></div>
      </Show>
    </Show>
  </div>;
}
