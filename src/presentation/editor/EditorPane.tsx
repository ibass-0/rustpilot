import { EditorView } from '@codemirror/view';
import { createEffect, onCleanup, onMount, Show, type JSX } from 'solid-js';
import { editor, setCursor } from '../../application/editorStore';
import { EditorTabs } from './EditorTabs';

/** What the pane needs from the buffer store: a place to mount its view, and a way to switch buffers. */
export interface EditorSurface {
  attach(view: EditorView): void;
  show(path: string | null): boolean;
}

/** The editor area: the tab strip plus a single CodeMirror view that swaps buffers as tabs change. */
export function EditorPane(props: { surface: EditorSurface }): JSX.Element {
  let host!: HTMLDivElement;
  let view: EditorView | undefined;

  onMount(() => {
    view = new EditorView({ parent: host });
    props.surface.attach(view);
    onCleanup(() => view?.destroy());

    createEffect(() => {
      const path = editor.activePath;
      if (!view || !props.surface.show(path)) return;
      const head = view.state.selection.main.head;
      const line = view.state.doc.lineAt(head);
      setCursor(line.number, head - line.from + 1);
      view.focus();
    });
  });

  return (
    <>
      <Show when={editor.tabs.length > 0}>
        <EditorTabs />
      </Show>
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
    </>
  );
}
