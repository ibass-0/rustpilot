import { createSignal, For, Show, type JSX } from 'solid-js';
import { toggleDir, workspace } from '../../application/workspaceStore';
import { git } from '../../application/gitStore';
import { fileNameOf, type DirEntry } from '../../domain/fs';
import { FileTypeIcon, FolderTypeIcon } from '../icons/FileTypeIcon';
import { ChevronIcon } from '../layout/icons';

interface TreeProps {
  activePath: string | null;
  onOpenFile: (path: string) => void;
  onOpenChange: (path: string, staged: boolean) => void;
}

const indent = (depth: number) => ({ 'padding-left': `calc(6px + ${depth} * var(--tree-indent))` });
const slash = (path: string) => path.replace(/\\/g, '/');
function relativePath(path: string): string {
  const root = git.root;
  if (!root) return slash(path);
  const prefix = slash(root).replace(/\/$/, '') + '/';
  const normalized = slash(path);
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
}
function gitStatus(path: string, isDir: boolean): { mark: string; className: string } | null {
  const relative = relativePath(path);
  const changes = git.status.changes.filter((change) => {
    const changed = slash(change.path);
    return isDir ? changed.startsWith(`${relative}/`) : changed === relative;
  });
  if (!changes.length) return null;
  if (changes.some((change) => change.kind === 'conflicted')) return { mark: '!', className: 'git-conflict' };
  if (changes.every((change) => change.staged)) return { mark: 'S', className: 'git-staged' };
  if (changes.some((change) => change.kind === 'untracked' || change.kind === 'added')) return { mark: 'U', className: 'git-added' };
  return { mark: 'M', className: 'git-modified' };
}

function TreeRow(props: TreeProps & { entry: DirEntry; depth: number }): JSX.Element {
  const expanded = () => props.entry.isDir && workspace.expanded[props.entry.path] === true;
  const status = () => gitStatus(props.entry.path, props.entry.isDir);

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
        <span class={`tree-name ${status()?.className ?? ''}`}>{props.entry.name}</span>
        <Show when={status()}>{(value) => <span class={`tree-git-status ${value().className}`}>{value().mark}</span>}</Show>
      </button>
      <Show when={expanded()}>
        <TreeLevel
          path={props.entry.path}
          depth={props.depth + 1}
          activePath={props.activePath}
          onOpenFile={props.onOpenFile}
          onOpenChange={props.onOpenChange}
        />
      </Show>
    </>
  );
}

function TreeLevel(props: TreeProps & { path: string; depth: number }): JSX.Element {
  return (
    <For each={workspace.children[props.path] ?? []}>
      {(entry) => (
        <TreeRow entry={entry} depth={props.depth} activePath={props.activePath} onOpenFile={props.onOpenFile} onOpenChange={props.onOpenChange} />
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
                <FolderTypeIcon name="" open={rootOpen()} root />
              </span>
              <span class="tree-name">{fileNameOf(root()) || root()}</span>
              <span class="tree-hint">{root()}</span>
            </button>
            <Show when={rootOpen()}>
              <TreeLevel path={root()} depth={1} activePath={props.activePath} onOpenFile={props.onOpenFile} onOpenChange={props.onOpenChange} />
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
