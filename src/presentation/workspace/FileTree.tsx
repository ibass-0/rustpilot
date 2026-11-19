import { createSignal, For, Show, type JSX } from 'solid-js';
import { toggleDir, workspace } from '../../application/workspaceStore';
import { fileNameOf, type DirEntry } from '../../domain/fs';
import { FileTypeIcon, FolderTypeIcon } from '../icons/FileTypeIcon';
import { ChevronIcon } from '../layout/icons';

interface TreeProps {
  activePath: string | null;
  onOpenFile: (path: string) => void;
}

const indent = (depth: number) => ({ 'padding-left': `calc(6px + ${depth} * var(--tree-indent))` });

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
        style={indent(props.depth)}
        title={props.entry.path}
        onClick={activate}
      >
        <span class="tree-chevron" data-expanded={expanded() ? '' : undefined}>
          <Show when={props.entry.isDir}>
            <ChevronIcon size={14} />
          </Show>
        </span>
        <span class="tree-icon">
          {props.entry.isDir ? (
            <FolderTypeIcon name={props.entry.name} open={expanded()} />
          ) : (
            <FileTypeIcon name={props.entry.name} />
          )}
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

/**
 * The workspace tree, rooted at a row for the open folder. Directories load
 * their children the first time they are expanded.
 */
export function FileTree(props: TreeProps): JSX.Element {
  const [rootOpen, setRootOpen] = createSignal(true);

  return (
    <div class="tree" role="tree">
      <Show when={workspace.root}>
        {(root) => (
          <>
            <button
              type="button"
              class="tree-row tree-root"
              role="treeitem"
              aria-expanded={rootOpen()}
              style={indent(0)}
              title={root()}
              onClick={() => setRootOpen((open) => !open)}
            >
              <span class="tree-chevron" data-expanded={rootOpen() ? '' : undefined}>
                <ChevronIcon size={14} />
              </span>
              <span class="tree-icon">
                <FolderTypeIcon name="" open={rootOpen()} />
              </span>
              <span class="tree-name">{fileNameOf(root()) || root()}</span>
              <span class="tree-hint">{root()}</span>
            </button>
            <Show when={rootOpen()}>
              <TreeLevel path={root()} depth={1} activePath={props.activePath} onOpenFile={props.onOpenFile} />
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
