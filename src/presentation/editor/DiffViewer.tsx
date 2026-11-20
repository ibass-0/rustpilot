import { For, Show, type JSX } from 'solid-js';
import { diff } from '../../application/diffStore';
import { fileNameOf } from '../../domain/fs';

export function DiffViewer(): JSX.Element {
  const lines = () => diff.text.split('\n');
  return (
    <div class="diff-viewer">
      <header class="diff-header">
        <span class="diff-title">{fileNameOf(diff.path ?? '')}</span>
        <span class="diff-path">{diff.path}</span>
        <span class="diff-mode">{diff.staged ? 'Staged' : 'Working Tree'}</span>
      </header>
      <Show when={!diff.loading} fallback={<div class="empty-state">Loading diff…</div>}>
        <Show when={!diff.error} fallback={<div class="empty-state">{diff.error}</div>}>
          <Show when={diff.text.length > 0} fallback={<div class="empty-state">No textual changes for this file.</div>}>
            <pre class="diff-content">
              <For each={lines()}>
                {(line) => <div class={`diff-line ${line.startsWith('+') && !line.startsWith('+++') ? 'diff-add' : ''} ${line.startsWith('-') && !line.startsWith('---') ? 'diff-remove' : ''} ${line.startsWith('@@') ? 'diff-hunk' : ''}`}>{line || ' '}</div>}
              </For>
            </pre>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
