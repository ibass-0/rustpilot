import { createEffect, For, onCleanup, Show, type JSX } from 'solid-js';
import { applyHunkAction, diff, setDiffMode, stepHunk } from '../../application/diffStore';
import type { DiffHunk } from '../../domain/diff';
import { fileNameOf } from '../../domain/fs';
import { sideBySideSurface } from './diffSurface';

function HunkView(props: { hunk: DiffHunk; index: number; current: boolean }): JSX.Element {
  const staged = () => diff.staged;
  let element!: HTMLDivElement;
  createEffect(() => {
    if (props.current) element.scrollIntoView({ block: 'nearest' });
  });
  return (
    <div class="diff-hunk-block" classList={{ 'is-current': props.current }} ref={element}>
      <div class="diff-hunk">
        <span class="diff-hunk-header">{props.hunk.header}</span>
        <span class="diff-hunk-actions">
          <button type="button" class="diff-hunk-button" onClick={() => void applyHunkAction(props.index, staged() ? 'unstage' : 'stage')}>
            {staged() ? 'Unstage' : 'Stage'}
          </button>
          <Show when={!staged()}>
            <button type="button" class="diff-hunk-button diff-hunk-danger" onClick={() => void applyHunkAction(props.index, 'discard')}>
              Revert…
            </button>
          </Show>
        </span>
      </div>
      <For each={props.hunk.lines}>
        {(line) => (
          <div class={`diff-line ${line.kind === 'add' ? 'diff-add' : line.kind === 'remove' ? 'diff-remove' : ''}`}>
            <span class="diff-sign">{line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}</span>
            {line.text || ' '}
          </div>
        )}
      </For>
    </div>
  );
}

/** Draws the two versions of the open file side by side, and cleans up when they change. */
function SideBySide(): JSX.Element {
  let host!: HTMLDivElement;
  createEffect(() => {
    const versions = diff.versions;
    const surface = sideBySideSurface();
    const path = diff.path;
    if (!versions || !surface || !path) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    void surface.mount(host, versions.original ?? '', versions.modified ?? '', path).then((stop) => {
      if (cancelled) stop();
      else dispose = stop;
    });
    onCleanup(() => {
      cancelled = true;
      dispose?.();
      host.replaceChildren();
    });
  });
  return <div class="diff-split" ref={host} />;
}

/** The open file's changes: a unified diff with Stage / Unstage / Revert per hunk, or the two versions side by side. */
export function DiffViewer(): JSX.Element {
  const hunks = () => diff.files[0]?.hunks ?? [];
  return (
    <div class="diff-viewer">
      <header class="diff-header">
        <span class="diff-title">{fileNameOf(diff.path ?? '')}</span>
        <span class="diff-path">{diff.path}</span>
        <Show when={hunks().length > 0 && diff.mode === 'unified'}>
          <span class="diff-nav">
            <button type="button" class="diff-nav-button" title="Previous change" aria-label="Previous change" disabled={diff.hunkIndex === 0} onClick={() => stepHunk(-1)}>
              ↑
            </button>
            <span class="diff-nav-count">
              {diff.hunkIndex + 1} / {hunks().length}
            </span>
            <button type="button" class="diff-nav-button" title="Next change" aria-label="Next change" disabled={diff.hunkIndex >= hunks().length - 1} onClick={() => stepHunk(1)}>
              ↓
            </button>
          </span>
        </Show>
        <span class="diff-modes" role="group" aria-label="Diff view">
          <button type="button" class="diff-nav-button" aria-pressed={diff.mode === 'unified'} onClick={() => setDiffMode('unified')}>
            Unified
          </button>
          <button type="button" class="diff-nav-button" aria-pressed={diff.mode === 'split'} onClick={() => setDiffMode('split')}>
            Side-by-side
          </button>
        </span>
        <span class="diff-mode">{diff.staged ? 'Staged' : 'Working Tree'}</span>
      </header>
      <Show when={!diff.loading} fallback={<div class="empty-state">Loading diff…</div>}>
        <Show when={diff.error}>{(message) => <div class="diff-error" role="alert">{message()}</div>}</Show>
        <Show when={diff.mode === 'unified'} fallback={
          <Show when={diff.versionsError} fallback={<SideBySide />}>
            {(message) => <div class="empty-state">{message()}</div>}
          </Show>
        }>
          <Show when={hunks().length > 0} fallback={<div class="empty-state">{diff.text.length > 0 ? 'This change cannot be shown as text.' : 'No textual changes for this file.'}</div>}>
            <div class="diff-content">
              <For each={hunks()}>{(hunk, index) => <HunkView hunk={hunk} index={index()} current={index() === diff.hunkIndex} />}</For>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
