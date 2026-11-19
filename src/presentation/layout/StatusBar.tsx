import { Show, type JSX } from 'solid-js';
import { FileTypeIcon } from '../icons/FileTypeIcon';
import { FolderIcon } from './icons';

export interface StatusBarProps {
  root: string | null;
  fileName: string | null;
  cursor: { line: number; col: number } | null;
  lineEnding: 'lf' | 'crlf' | null;
}

export function StatusBar(props: StatusBarProps): JSX.Element {
  return (
    <footer class="status-bar">
      <div class="status-crumbs">
        <FolderIcon size={13} />
        <span title={props.root ?? undefined}>{props.root ?? 'No folder open'}</span>
        <Show when={props.fileName}>
          <span class="status-separator">›</span>
          <FileTypeIcon name={props.fileName ?? ''} size={13} />
          <span>{props.fileName}</span>
        </Show>
      </div>
      <Show when={props.fileName}>
        <div class="status-items">
          <Show when={props.cursor}>{(cursor) => <span>{`Ln ${cursor().line}, Col ${cursor().col}`}</span>}</Show>
          <Show when={props.lineEnding}>{(ending) => <span>{ending().toUpperCase()}</span>}</Show>
          <span>UTF-8</span>
        </div>
      </Show>
    </footer>
  );
}
