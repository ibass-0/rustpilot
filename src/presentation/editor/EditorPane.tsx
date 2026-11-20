import { createEffect, onCleanup, onMount, Show, type JSX } from 'solid-js';
import { editor, setCursor } from '../../application/editorStore';
import type { CursorPosition } from '../../domain/editor';
import { EditorTabs } from './EditorTabs';
import { DiffViewer } from './DiffViewer';
import { diff } from '../../application/diffStore';

/** What the pane needs from the editor engine: somewhere to draw, and a way to switch buffers. */
export interface EditorSurface {
  /** Create the editor inside `host`. Returns a function that removes it again. */
  mount(host: HTMLElement): () => void;
  /** Display the buffer for `path`. Returns its cursor position, or `null` when there is nothing to show. */
  show(path: string | null): CursorPosition | null;
  focus(): void;
}

/** The editor area: the tab strip plus a single editor surface that swaps buffers as tabs change. */
export function EditorPane(props: { surface: EditorSurface }): JSX.Element {
  let host!: HTMLDivElement;

  onMount(() => {
    onCleanup(props.surface.mount(host));

    createEffect(() => {
      const cursor = props.surface.show(editor.activePath);
      if (!cursor) return;
      setCursor(cursor.line, cursor.col);
      props.surface.focus();
    });
  });

  return (
    <>
      <Show when={editor.tabs.length > 0 && !diff.path}>
        <EditorTabs />
      </Show>
      <Show when={diff.path} fallback={<>
        <div class="editor-host" ref={host} hidden={editor.activePath === null} />
        <Show when={editor.activePath === null}>
        <div class="empty-state editor-empty">
          <span class="editor-empty-title">RustPilot</span>
          <span>Open a file from the Project tool window to start editing.</span>
          <span>
            <kbd>Alt</kbd> + <kbd>1</kbd> Project &nbsp;·&nbsp; <kbd>Ctrl</kbd> + <kbd>S</kbd> Save &nbsp;·&nbsp;{' '}
            <kbd>Ctrl</kbd> + <kbd>W</kbd> Close tab
          </span>
        </div>
        </Show>
      </>}>
        <DiffViewer />
      </Show>
    </>
  );
}
