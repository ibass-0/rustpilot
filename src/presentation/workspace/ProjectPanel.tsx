import { Show, type JSX } from 'solid-js';
import { pickAndOpenWorkspace, workspace } from '../../application/workspaceStore';
import { fileNameOf } from '../../domain/fs';
import { FolderIcon } from '../layout/icons';
import { FileTree } from './FileTree';

/** Contents of the Project tool window: an "open folder" prompt, or the workspace tree. */
export function ProjectPanel(props: { activePath: string | null; onOpenFile: (path: string) => void }): JSX.Element {
  return (
    <Show
      when={workspace.root}
      fallback={
        <div class="empty-state">
          <FolderIcon size={28} />
          <span>No folder open.</span>
          <button type="button" class="button button-primary" onClick={() => void pickAndOpenWorkspace()}>
            Open Folder
          </button>
        </div>
      }
    >
      {(root) => (
        <>
          <div class="project-root" title={root()}>
            <span class="project-root-name">{fileNameOf(root()) || root()}</span>
            <button
              type="button"
              class="icon-button"
              title="Open another folder"
              aria-label="Open another folder"
              onClick={() => void pickAndOpenWorkspace()}
            >
              <FolderIcon />
            </button>
          </div>
          <FileTree activePath={props.activePath} onOpenFile={props.onOpenFile} />
        </>
      )}
    </Show>
  );
}
