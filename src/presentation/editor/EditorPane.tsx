import { createEffect, createSignal, lazy, onCleanup, onMount, Show, Suspense, type JSX } from 'solid-js';
import { editor, setCursor } from '../../application/editorStore';
import type { CursorPosition } from '../../domain/editor';
import { EditorTabs } from './EditorTabs';
import { DiffViewer } from './DiffViewer';
import { diff } from '../../application/diffStore';
import { attachedSource, isSqlFile, sqlConsole } from '../../application/sqlConsoleStore';
import { MarkdownPreview } from './MarkdownPreview';

// Query console parts load with the Database feature, not with the editor.
const ConsoleBar = lazy(() => import('../database/ConsoleBar'));
const ResultPanel = lazy(() => import('../database/ResultPanel'));

/** What the pane needs from the editor engine: somewhere to draw, and a way to switch buffers. */
export interface EditorSurface {
  /** Create the editor inside `host`. Returns a function that removes it again. */
  mount(host: HTMLElement): () => void;
  /** Display the buffer for `path`. Returns its cursor position, or `null` when there is nothing to show. */
  show(path: string | null): CursorPosition | null;
  focus(): void;
  /** Tables and columns to complete in the SQL buffer of `path`. */
  setSqlSchema(path: string, schema: Record<string, string[]>): void;
  text(path: string): string;
  revealLine(line: number): void;
}

/** The editor area: the tab strip plus a single editor surface that swaps buffers as tabs change. */
export function EditorPane(props: { surface: EditorSurface }): JSX.Element {
  let host!: HTMLDivElement;
  const [markdownPreview, setMarkdownPreview] = createSignal(false);

  onMount(() => {
    onCleanup(props.surface.mount(host));

    createEffect(() => {
      const cursor = props.surface.show(editor.activePath);
      if (!cursor) return;
      setCursor(cursor.line, cursor.col);
      props.surface.focus();
    });
  });

  const sqlPath = (): string | null => (editor.activePath && isSqlFile(editor.activePath) ? editor.activePath : null);
  const markdownPath = (): string | null => (editor.activePath && /\.md$/i.test(editor.activePath) ? editor.activePath : null);
  const showResult = (): boolean => {
    const path = sqlPath();
    return !!path && !!attachedSource(path) && (sqlConsole.results[path] !== undefined || sqlConsole.running?.path === path);
  };

  return (
    <>
      <Show when={editor.tabs.length > 0 && !diff.path}>
        <div class="editor-toolbar"><EditorTabs /><Show when={markdownPath()}><div class="markdown-mode"><button type="button" classList={{ active: !markdownPreview() }} onClick={() => setMarkdownPreview(false)}>Code</button><button type="button" classList={{ active: markdownPreview() }} onClick={() => setMarkdownPreview(true)}>Preview</button></div></Show></div>
      </Show>
      <Show when={diff.path} fallback={<>
        <Show when={sqlPath()}>
          {(path) => (
            <Suspense>
              <ConsoleBar path={path()} surface={props.surface} />
            </Suspense>
          )}
        </Show>
        <Show when={!markdownPreview() || !markdownPath()} fallback={<MarkdownPreview source={props.surface.text(markdownPath()!)} />}>
          <div class="editor-host" ref={host} hidden={editor.activePath === null} />
        </Show>
        <Show when={showResult() && sqlPath()}>
          {(path) => (
            <Suspense>
              <ResultPanel path={path()} />
            </Suspense>
          )}
        </Show>
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
