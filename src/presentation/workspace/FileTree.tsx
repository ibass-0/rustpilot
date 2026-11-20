import { createSignal, For, onCleanup, Show, type JSX } from 'solid-js';
import { changesAt } from '../../application/gitStore';
import { pickAndAddFolder, removeFromWorkspace, toggleDir, workspace } from '../../application/workspaceStore';
import { fileNameOf, type DirEntry } from '../../domain/fs';
import { summarizeChanges } from '../../domain/git';
import type { Project } from '../../domain/workspace';
import { FileTypeIcon, FolderTypeIcon } from '../icons/FileTypeIcon';
import { ChevronIcon } from '../layout/icons';

interface TreeProps {
  activePath: string | null;
  onOpenFile: (path: string) => void;
}

const indent = (depth: number) => ({ 'padding-left': `calc(6px + ${depth} * var(--tree-indent))` });

function TreeRow(props: TreeProps & { entry: DirEntry; depth: number }): JSX.Element {
  const expanded = () => props.entry.isDir && workspace.expanded[props.entry.path] === true;
  // Decorated from whichever repository owns the path, in any project.
  const status = () => summarizeChanges(changesAt(props.entry.path, props.entry.isDir));

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
        <TreeLevel path={props.entry.path} depth={props.depth + 1} activePath={props.activePath} onOpenFile={props.onOpenFile} />
      </Show>
    </>
  );
}

function TreeLevel(props: TreeProps & { path: string; depth: number }): JSX.Element {
  return (
    <For each={workspace.children[props.path] ?? []}>
      {(entry) => <TreeRow entry={entry} depth={props.depth} activePath={props.activePath} onOpenFile={props.onOpenFile} />}
    </For>
  );
}

/** One project: a row for its folder, and below it the folders and files. */
function ProjectTree(props: TreeProps & { project: Project; onContextMenu: (event: MouseEvent, project: Project) => void }): JSX.Element {
  const [open, setOpen] = createSignal(true);
  const status = () => summarizeChanges(changesAt(props.project.root, true));
  return (
    <>
      <button
        type="button"
        class="tree-row tree-root"
        role="treeitem"
        aria-expanded={open()}
        style={indent(0)}
        title={props.project.root}
        onClick={() => setOpen((value) => !value)}
        onContextMenu={(event) => {
          event.preventDefault();
          props.onContextMenu(event, props.project);
        }}
      >
        <span class="tree-chevron" data-expanded={open() ? '' : undefined}>
          <ChevronIcon size={14} />
        </span>
        <span class="tree-icon">
          <FolderTypeIcon name="" open={open()} root />
        </span>
        <span class="tree-name">{fileNameOf(props.project.root) || props.project.root}</span>
        <span class="tree-hint">{props.project.root}</span>
        <Show when={status()}>{(value) => <span class={`tree-git-status ${value().className}`}>{value().mark}</span>}</Show>
      </button>
      <Show when={open()}>
        <TreeLevel path={props.project.root} depth={1} activePath={props.activePath} onOpenFile={props.onOpenFile} />
      </Show>
    </>
  );
}

/**
 * The workspace tree: one root row per project. Directories load their children the first time
 * they are expanded. Right-click a project to remove it from the workspace.
 */
export function FileTree(props: TreeProps): JSX.Element {
  const [menu, setMenu] = createSignal<{ x: number; y: number; project: Project } | null>(null);

  const close = (event?: Event) => {
    if (!event || !(event.target as HTMLElement).closest('.project-menu')) setMenu(null);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setMenu(null);
  };
  window.addEventListener('pointerdown', close, true);
  window.addEventListener('keydown', onKeyDown, true);
  onCleanup(() => {
    window.removeEventListener('pointerdown', close, true);
    window.removeEventListener('keydown', onKeyDown, true);
  });

  return (
    <div class="tree" role="tree">
      <For each={workspace.projects}>
        {(project) => (
          <ProjectTree
            project={project}
            activePath={props.activePath}
            onOpenFile={props.onOpenFile}
            onContextMenu={(event, target) => setMenu({ x: event.clientX, y: event.clientY, project: target })}
          />
        )}
      </For>
      <Show when={menu()}>
        {(open) => (
          <div class="menu project-menu" role="menu" style={{ position: 'fixed', left: `${open().x}px`, top: `${open().y}px`, 'z-index': 70 }}>
            <button
              type="button"
              class="menu-item"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                void pickAndAddFolder();
              }}
            >
              Add Folder to Workspace…
            </button>
            <button
              type="button"
              class="menu-item"
              role="menuitem"
              onClick={() => {
                const root = open().project.root;
                setMenu(null);
                removeFromWorkspace(root);
              }}
            >
              Remove from Workspace
            </button>
          </div>
        )}
      </Show>
    </div>
  );
}
