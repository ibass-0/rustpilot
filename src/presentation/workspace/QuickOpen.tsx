import { createMemo, createSignal, For, onCleanup, onMount, Show, type JSX } from 'solid-js';
import { quickOpen, indexWorkspace } from '../../application/quickOpenStore';
import { fileNameOf } from '../../domain/fs';

function fuzzy(query: string, path: string): boolean {
  let at = 0;
  const text = path.toLowerCase();
  for (const char of query.toLowerCase()) { at = text.indexOf(char, at); if (at < 0) return false; at++; }
  return true;
}

export function QuickOpen(props: { onOpen: (path: string) => void; onClose: () => void }): JSX.Element {
  const [query, setQuery] = createSignal('');
  const [selected, setSelected] = createSignal(0);
  let input!: HTMLInputElement;
  const results = createMemo(() => quickOpen.files.filter((path) => fuzzy(query(), path)).slice(0, 100));
  const choose = () => { const path = results()[selected()]; if (path) { props.onClose(); props.onOpen(path); } };
  onMount(() => {
    input.focus();
    void indexWorkspace();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); props.onClose(); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((n) => Math.min(n + 1, Math.max(results().length - 1, 0))); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((n) => Math.max(n - 1, 0)); }
      else if (event.key === 'Enter') { event.preventDefault(); choose(); }
    };
    input.addEventListener('keydown', key);
    onCleanup(() => input.removeEventListener('keydown', key));
  });
  return <div class="palette-backdrop" onClick={props.onClose}>
    <section class="command-palette" role="dialog" aria-modal="true" aria-label="Quick Open" onClick={(event) => event.stopPropagation()}>
      <input ref={input} class="palette-input" type="search" placeholder="Search files by name…" aria-label="Search files" onInput={(event) => { setQuery(event.currentTarget.value); setSelected(0); }} />
      <div class="palette-results" role="listbox">
        <Show when={!quickOpen.loading} fallback={<div class="palette-empty">Indexing workspace…</div>}>
          <For each={results()} fallback={<div class="palette-empty">No files found.</div>}>
            {(path, index) => <button type="button" class="palette-command" classList={{ selected: selected() === index() }} role="option" aria-selected={selected() === index()} onMouseEnter={() => setSelected(index())} onClick={() => { props.onClose(); props.onOpen(path); }}>
              <span>{fileNameOf(path)}</span><span class="quick-open-path">{path}</span>
            </button>}
          </For>
        </Show>
      </div>
    </section>
  </div>;
}
