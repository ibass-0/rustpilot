import { For, Show, type JSX } from 'solid-js';
import { toggleDir, workspace } from '../../application/workspaceStore';
import type { DirEntry } from '../../domain/fs';
import { ChevronIcon, FileIcon, FolderIcon } from '../layout/icons';

interface TreeProps {
  activePath: string | null;
  onOpenFile: (path: string) => void;
}

function TreeRow(props: TreeProps & { entry: DirEntry; depth: number }): JSX.Element {
  const expanded = () => props.entry.isDir && workspace.expanded[props.entry.path] === true;

  const activate = () => {
    if (props.entry.isDir) void toggleDir(props.entry.path);
    else props.onOpenFile(props.entry.path);
  };

  return (
    <>
      <button
        type="button"
        class="tree-row"
        role="treeitem"
        aria-expanded={props.entry.isDir ? expanded() : undefined}
        aria-selected={props.activePath === props.entry.path}
        style={{ 'padding-left': `calc(8px + ${props.depth} * var(--tree-indent))` }}
        title={props.entry.path}
        onClick={activate}
      >
        <span class="tree-chevron" data-expanded={expanded() ? '' : undefined}>
          <Show when={props.entry.isDir}>
            <ChevronIcon size={14} />
          </Show>
        </span>
        <span class={props.entry.isDir ? 'tree-icon tree-icon-dir' : 'tree-icon'}>
          {props.entry.isDir ? <FolderIcon /> : <FileIcon />}
        </span>
        <span class="tree-name">{props.entry.name}</span>
      </button>
      <Show when={expanded()}>
        <TreeLevel
          path={props.entry.path}
          depth={props.depth + 1}
          activePath={props.activePath}
          onOpenFile={props.onOpenFile}
        />
      </Show>
    </>
  );
}

function TreeLevel(props: TreeProps & { path: string; depth: number }): JSX.Element {
  return (
    <For each={workspace.children[props.path] ?? []}>
      {(entry) => (
        <TreeRow entry={entry} depth={props.depth} activePath={props.activePath} onOpenFile={props.onOpenFile} />
      )}
    </For>
  );
}

/** The workspace tree. Directories load their children the first time they are expanded. */
export function FileTree(props: TreeProps): JSX.Element {
  return (
    <div class="tree" role="tree">
      <Show when={workspace.root}>
        {(root) => <TreeLevel path={root()} depth={0} activePath={props.activePath} onOpenFile={props.onOpenFile} />}
      </Show>
    </div>
  );
}
