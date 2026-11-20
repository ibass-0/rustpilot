import { createMemo, createSignal, For, onCleanup, Show, type JSX } from 'solid-js';
import {
  browseHistory,
  commitDraft,
  commitRepository,
  commitState,
  setAmend,
  setCommitView,
  setMessage,
  setSignOff,
} from '../../application/commitStore';
import {
  discardChangesConfirmed,
  git,
  stageAllInRepository,
  stageInRepository,
  unstageAllInRepository,
  unstageInRepository,
  type RepositoryState,
} from '../../application/gitStore';
import { workspace } from '../../application/workspaceStore';
import { buildChangeTree, groupChanges, type ChangeTreeNode } from '../../domain/commit';
import { fileNameOf } from '../../domain/fs';
import { repositoryKey, repositoryLabel, type GitChange } from '../../domain/git';
import { FileTypeIcon } from '../icons/FileTypeIcon';
import { ChevronIcon, MinimizeIcon, PlusIcon } from '../layout/icons';

type GroupId = 'conflicts' | 'staged' | 'working' | 'untracked';

const parentOf = (path: string): string => {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut < 0 ? '' : path.slice(0, cut);
};

const labelOf = (change: GitChange): string => {
  if (change.kind === 'renamed' && change.originalPath) return `${fileNameOf(change.originalPath)} → ${fileNameOf(change.path)}`;
  return fileNameOf(change.path);
};

const markerOf = (change: GitChange): string =>
  ({ modified: 'M', added: 'A', deleted: 'D', renamed: 'R', copied: 'C', untracked: 'U', conflicted: '!' })[change.kind];

/** A rename touches both sides in the index; pass both paths to Git. */
const operationPaths = (change: GitChange): string[] =>
  change.originalPath ? [change.path, change.originalPath] : [change.path];

const unique = (paths: string[]): string[] => [...new Set(paths)];

interface Actions {
  repository: RepositoryState;
  open: (change: GitChange) => void;
  openFile: (change: GitChange) => void;
}

interface Selection {
  isSelected: (group: GroupId, change: GitChange) => boolean;
  /** A plain click selects one row; Ctrl toggles; Shift extends from the last click within the group. */
  click: (group: GroupId, change: GitChange, ordered: GitChange[], event: MouseEvent) => boolean;
  clear: () => void;
  of: (group: GroupId, ordered: GitChange[]) => GitChange[];
}

function createSelection(): Selection {
  const [picked, setPicked] = createSignal<Set<string>>(new Set());
  let anchor: string | null = null;
  const key = (group: GroupId, change: GitChange) => `${group}|${change.path}`;
  return {
    isSelected: (group, change) => picked().has(key(group, change)),
    click(group, change, ordered, event) {
      const id = key(group, change);
      if (event.shiftKey && anchor !== null && anchor.startsWith(`${group}|`)) {
        const paths = ordered.map((c) => c.path);
        const from = paths.indexOf(anchor.slice(group.length + 1));
        const to = paths.indexOf(change.path);
        if (from >= 0 && to >= 0) {
          const [lo, hi] = from < to ? [from, to] : [to, from];
          setPicked(new Set(paths.slice(lo, hi + 1).map((p) => `${group}|${p}`)));
          return true;
        }
      }
      if (event.ctrlKey || event.metaKey) {
        const next = new Set(picked());
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setPicked(next);
        anchor = id;
        return true;
      }
      setPicked(new Set([id]));
      anchor = id;
      return false;
    },
    clear: () => setPicked(new Set()),
    of: (group, ordered) => ordered.filter((change) => picked().has(key(group, change))),
  };
}

interface MenuState {
  x: number;
  y: number;
  group: GroupId;
  changes: GitChange[];
}

const GROUP_TITLES: Record<GroupId, string> = {
  conflicts: 'Merge Conflicts',
  staged: 'Staged Changes',
  working: 'Changes',
  untracked: 'Untracked Files',
};

function ChangeRow(props: {
  change: GitChange;
  group: GroupId;
  ordered: GitChange[];
  depth: number;
  showPath: boolean;
  actions: Actions;
  selection: Selection;
  onMenu: (event: MouseEvent, group: GroupId, changes: GitChange[]) => void;
}): JSX.Element {
  const staged = () => props.group === 'staged';
  const canToggle = () => props.group !== 'conflicts';
  const run = (change: GitChange) =>
    staged()
      ? unstageInRepository(props.actions.repository.root, operationPaths(change))
      : stageInRepository(props.actions.repository.root, operationPaths(change));
  return (
    <div
      class="commit-change"
      classList={{ 'is-selected': props.selection.isSelected(props.group, props.change) }}
      role="listitem"
      aria-selected={props.selection.isSelected(props.group, props.change)}
      style={{ 'padding-left': `${8 + props.depth * 14}px` }}
      title={`${props.change.path} — click to open the diff, Ctrl/Shift+click to select several`}
      tabindex="0"
      onClick={(event) => {
        const multi = props.selection.click(props.group, props.change, props.ordered, event);
        if (!multi) props.actions.open(props.change);
      }}
      onDblClick={() => props.actions.openFile(props.change)}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!props.selection.isSelected(props.group, props.change)) props.selection.click(props.group, props.change, props.ordered, new MouseEvent('click'));
        props.onMenu(event, props.group, props.selection.of(props.group, props.ordered));
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          props.actions.open(props.change);
        }
      }}
    >
      <FileTypeIcon name={props.change.path} size={16} />
      <span class="commit-change-name">{props.showPath ? labelOf(props.change) : fileNameOf(props.change.path)}</span>
      <Show when={props.showPath}>
        <span class="commit-change-path">{parentOf(props.change.path)}</span>
      </Show>
      <span class={`commit-change-kind kind-${props.change.kind}`}>{markerOf(props.change)}</span>
      <Show when={canToggle()}>
        <button
          type="button"
          class="commit-file-action"
          title={`${staged() ? 'Unstage' : 'Stage'} ${props.change.path}`}
          aria-label={`${staged() ? 'Unstage' : 'Stage'} ${props.change.path}`}
          disabled={props.actions.repository.busy}
          onClick={(event) => {
            event.stopPropagation();
            void run(props.change);
          }}
        >
          {staged() ? <MinimizeIcon size={13} /> : <PlusIcon size={13} />}
        </button>
      </Show>
    </div>
  );
}

function TreeNodes(props: {
  nodes: ChangeTreeNode[];
  group: GroupId;
  ordered: GitChange[];
  depth: number;
  actions: Actions;
  selection: Selection;
  onMenu: (event: MouseEvent, group: GroupId, changes: GitChange[]) => void;
}): JSX.Element {
  return (
    <For each={props.nodes}>
      {(node) => (
        <Show
          when={node.change === null}
          fallback={
            <ChangeRow
              change={node.change!}
              group={props.group}
              ordered={props.ordered}
              depth={props.depth}
              showPath={false}
              actions={props.actions}
              selection={props.selection}
              onMenu={props.onMenu}
            />
          }
        >
          <FolderRow {...props} node={node} />
        </Show>
      )}
    </For>
  );
}

function FolderRow(props: {
  node: ChangeTreeNode;
  group: GroupId;
  ordered: GitChange[];
  depth: number;
  actions: Actions;
  selection: Selection;
  onMenu: (event: MouseEvent, group: GroupId, changes: GitChange[]) => void;
}): JSX.Element {
  const [open, setOpen] = createSignal(true);
  const staged = () => props.group === 'staged';
  const paths = () => unique(props.node.changes.flatMap(operationPaths));
  return (
    <>
      <div
        class="commit-folder"
        role="listitem"
        style={{ 'padding-left': `${8 + props.depth * 14}px` }}
        onClick={() => setOpen((value) => !value)}
        onContextMenu={(event) => {
          event.preventDefault();
          props.onMenu(event, props.group, props.node.changes);
        }}
      >
        <span class="tree-chevron" data-expanded={open() ? '' : undefined}>
          <ChevronIcon size={13} />
        </span>
        <span class="commit-folder-name" title={props.node.path}>{props.node.name}</span>
        <span class="commit-count">{props.node.count}</span>
        <Show when={props.group !== 'conflicts'}>
          <button
            type="button"
            class="commit-file-action"
            title={`${staged() ? 'Unstage' : 'Stage'} the folder`}
            aria-label={`${staged() ? 'Unstage' : 'Stage'} ${props.node.path}`}
            disabled={props.actions.repository.busy}
            onClick={(event) => {
              event.stopPropagation();
              void (staged()
                ? unstageInRepository(props.actions.repository.root, paths())
                : stageInRepository(props.actions.repository.root, paths()));
            }}
          >
            {staged() ? <MinimizeIcon size={13} /> : <PlusIcon size={13} />}
          </button>
        </Show>
      </div>
      <Show when={open()}>
        <TreeNodes
          nodes={props.node.children}
          group={props.group}
          ordered={props.ordered}
          depth={props.depth + 1}
          actions={props.actions}
          selection={props.selection}
          onMenu={props.onMenu}
        />
      </Show>
    </>
  );
}

function ChangeGroup(props: {
  group: GroupId;
  changes: GitChange[];
  actions: Actions;
  selection: Selection;
  onMenu: (event: MouseEvent, group: GroupId, changes: GitChange[]) => void;
}): JSX.Element {
  const staged = () => props.group === 'staged';
  const tree = createMemo(() => buildChangeTree(props.changes));
  const discardable = () => props.group === 'working' || props.group === 'untracked';
  return (
    <Show when={props.changes.length > 0}>
      <section class="commit-section">
        <header class="commit-section-header">
          <span>{GROUP_TITLES[props.group]}</span>
          <div class="commit-section-actions">
            <Show when={discardable()}>
              <button
                type="button"
                class="commit-group-action commit-discard"
                title="Discard All…"
                aria-label={`Discard all ${GROUP_TITLES[props.group]}`}
                disabled={props.actions.repository.busy}
                onClick={() => void discardChangesConfirmed(props.actions.repository.root, props.changes)}
              >
                ↶
              </button>
            </Show>
            <Show when={props.group !== 'conflicts'}>
              <button
                type="button"
                class="commit-group-action"
                title={`${staged() ? 'Unstage' : 'Stage'} All`}
                aria-label={`${staged() ? 'Unstage' : 'Stage'} All ${GROUP_TITLES[props.group]}`}
                disabled={props.actions.repository.busy}
                onClick={() =>
                  void (staged()
                    ? unstageInRepository(props.actions.repository.root, unique(props.changes.flatMap(operationPaths)))
                    : stageInRepository(props.actions.repository.root, unique(props.changes.flatMap(operationPaths))))
                }
              >
                {staged() ? <MinimizeIcon size={14} /> : <PlusIcon size={14} />}
              </button>
            </Show>
            <span class="commit-count">{props.changes.length}</span>
          </div>
        </header>
        <div role="list">
          <Show
            when={commitState.view === 'tree'}
            fallback={
              <For each={props.changes}>
                {(change) => (
                  <ChangeRow
                    change={change}
                    group={props.group}
                    ordered={props.changes}
                    depth={0}
                    showPath
                    actions={props.actions}
                    selection={props.selection}
                    onMenu={props.onMenu}
                  />
                )}
              </For>
            }
          >
            <TreeNodes
              nodes={tree()}
              group={props.group}
              ordered={props.changes}
              depth={0}
              actions={props.actions}
              selection={props.selection}
              onMenu={props.onMenu}
            />
          </Show>
        </div>
      </section>
    </Show>
  );
}

/** The message box, Commit button and options of one repository. */
function CommitBox(props: { repository: RepositoryState }): JSX.Element {
  const key = () => repositoryKey(props.repository.root);
  const draft = () => commitDraft(key());
  const stagedCount = () => props.repository.status.changes.filter((change) => change.staged).length;
  const canCommit = () => !props.repository.busy && draft().message.trim() !== '' && (draft().amend || stagedCount() > 0);
  return (
    <div class="commit-box">
      <textarea
        class="commit-message"
        rows={3}
        placeholder={draft().amend ? 'Amend the last commit message' : 'Commit message (Ctrl+Enter to commit)'}
        aria-label="Commit message"
        value={draft().message}
        onInput={(event) => setMessage(key(), event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.ctrlKey && event.key === 'Enter') {
            event.preventDefault();
            void commitRepository(props.repository.root);
          } else if (event.altKey && event.key === 'ArrowUp') {
            event.preventDefault();
            browseHistory(key(), 'older');
          } else if (event.altKey && event.key === 'ArrowDown') {
            event.preventDefault();
            browseHistory(key(), 'newer');
          }
        }}
      />
      <Show when={draft().error}>{(message) => <div class="commit-box-error" role="alert">{message()}</div>}</Show>
      <div class="commit-box-row">
        <label class="commit-option" title="Rewrite the last commit instead of making a new one">
          <input type="checkbox" checked={draft().amend} onChange={(event) => void setAmend(key(), event.currentTarget.checked)} />
          Amend
        </label>
        <label class="commit-option" title="Add a Signed-off-by line">
          <input type="checkbox" checked={draft().signOff} onChange={(event) => setSignOff(key(), event.currentTarget.checked)} />
          Sign-off
        </label>
        <button
          type="button"
          class="button button-primary commit-button"
          disabled={!canCommit()}
          title={stagedCount() === 0 && !draft().amend ? 'Stage changes to commit them' : `Commit ${stagedCount()} staged file${stagedCount() === 1 ? '' : 's'}`}
          onClick={() => void commitRepository(props.repository.root)}
        >
          {draft().amend ? 'Amend Commit' : 'Commit'}
        </button>
      </div>
    </div>
  );
}

/** One repository: its branch, the commit box, and its changes grouped. */
function RepositorySection(props: {
  repository: RepositoryState;
  showName: boolean;
  onOpenChange: (repositoryRoot: string, path: string, staged: boolean) => void;
  onOpenFile: (path: string) => void;
}): JSX.Element {
  const [collapsed, setCollapsed] = createSignal(false);
  const [menu, setMenu] = createSignal<MenuState | null>(null);
  const selection = createSelection();
  const groups = createMemo(() => groupChanges(props.repository.status.changes));
  const root = () => props.repository.root;

  const absolute = (change: GitChange) => `${root().replace(/[\\/]+$/, '')}/${change.path}`;
  const actions: Actions = {
    get repository() {
      return props.repository;
    },
    open: (change) => props.onOpenChange(root(), change.path, change.staged),
    openFile: (change) => props.onOpenFile(absolute(change)),
  };

  const onMenu = (event: MouseEvent, group: GroupId, changes: GitChange[]) =>
    setMenu({ x: event.clientX, y: event.clientY, group, changes });
  const closeMenu = (event?: Event) => {
    if (!event || !(event.target as HTMLElement).closest('.commit-menu')) setMenu(null);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setMenu(null);
  };
  window.addEventListener('pointerdown', closeMenu, true);
  window.addEventListener('keydown', onKeyDown, true);
  onCleanup(() => {
    window.removeEventListener('pointerdown', closeMenu, true);
    window.removeEventListener('keydown', onKeyDown, true);
  });

  const act = (action: (changes: GitChange[]) => unknown) => () => {
    const open = menu();
    setMenu(null);
    if (open) void action(open.changes);
  };
  const pathsOf = (changes: GitChange[]) => unique(changes.flatMap(operationPaths));

  return (
    <section class="commit-repository" data-repository={repositoryKey(root())}>
      <div class="commit-summary">
        <button
          type="button"
          class="commit-summary-button"
          aria-expanded={!collapsed()}
          title={root()}
          onClick={() => setCollapsed((value) => !value)}
        >
          <span class="tree-chevron" data-expanded={collapsed() ? undefined : ''}>
            <ChevronIcon size={14} />
          </span>
          <Show when={props.showName}>
            <span class="commit-repository-name">{repositoryLabel(props.repository, workspace.projects)}</span>
          </Show>
          <span class="commit-branch">{props.repository.status.branch ?? 'Unknown HEAD'}</span>
          <Show when={props.repository.status.ahead > 0 || props.repository.status.behind > 0}>
            <span class="commit-upstream" title={props.repository.status.upstream ?? undefined}>
              {props.repository.status.ahead > 0 ? `↑${props.repository.status.ahead}` : ''}
              {props.repository.status.behind > 0 ? ` ↓${props.repository.status.behind}` : ''}
            </span>
          </Show>
          <span class="commit-count">{props.repository.status.changes.length}</span>
        </button>
        <button
          type="button"
          class="commit-group-action"
          title="Stage All Changes"
          aria-label="Stage all changes in this repository"
          disabled={props.repository.busy || (groups().working.length === 0 && groups().untracked.length === 0)}
          onClick={() => void stageAllInRepository(root())}
        >
          <PlusIcon size={14} />
        </button>
        <button
          type="button"
          class="commit-group-action"
          title="Unstage All"
          aria-label="Unstage everything in this repository"
          disabled={props.repository.busy || groups().staged.length === 0}
          onClick={() => void unstageAllInRepository(root())}
        >
          <MinimizeIcon size={14} />
        </button>
      </div>
      <Show when={props.repository.error}>{(message) => <div class="commit-repository-error" role="alert">{message()}</div>}</Show>
      <Show when={!collapsed()}>
        <CommitBox repository={props.repository} />
        <ChangeGroup group="conflicts" changes={groups().conflicts} actions={actions} selection={selection} onMenu={onMenu} />
        <ChangeGroup group="staged" changes={groups().staged} actions={actions} selection={selection} onMenu={onMenu} />
        <ChangeGroup group="working" changes={groups().working} actions={actions} selection={selection} onMenu={onMenu} />
        <ChangeGroup group="untracked" changes={groups().untracked} actions={actions} selection={selection} onMenu={onMenu} />
      </Show>
      <Show when={menu()}>
        {(open) => (
          <div class="menu commit-menu" role="menu" style={{ position: 'fixed', left: `${open().x}px`, top: `${open().y}px`, 'z-index': 70 }}>
            <Show when={open().changes.length === 1}>
              <button type="button" class="menu-item" role="menuitem" onClick={act((changes) => actions.open(changes[0]))}>
                Open Diff
              </button>
              <Show when={open().changes[0].kind !== 'deleted'}>
                <button type="button" class="menu-item" role="menuitem" onClick={act((changes) => actions.openFile(changes[0]))}>
                  Open File
                </button>
              </Show>
              <div class="menu-separator" role="separator" />
            </Show>
            <Show when={open().group === 'staged'}>
              <button type="button" class="menu-item" role="menuitem" onClick={act((changes) => unstageInRepository(root(), pathsOf(changes)))}>
                Unstage
              </button>
            </Show>
            <Show when={open().group === 'working' || open().group === 'untracked'}>
              <button type="button" class="menu-item" role="menuitem" onClick={act((changes) => stageInRepository(root(), pathsOf(changes)))}>
                Stage
              </button>
              <button type="button" class="menu-item" role="menuitem" onClick={act((changes) => discardChangesConfirmed(root(), changes))}>
                Discard Changes…
              </button>
            </Show>
          </div>
        )}
      </Show>
    </section>
  );
}

/** The Commit tool window: every repository of every project in the workspace that has something to show. */
export function CommitPanel(props: {
  onOpenChange: (repositoryRoot: string, path: string, staged: boolean) => void;
  onOpenFile: (path: string) => void;
}): JSX.Element {
  const repositories = () => git.order.map((key) => git.repositories[key]).filter((repository) => repository !== undefined);
  /** Clean repositories stay out of the way, unless nothing at all has changed. */
  const shown = () => repositories().filter((repository) => repository.status.changes.length > 0 || repository.error !== null);
  const loading = () => repositories().some((repository) => repository.loading && !repository.status.isRepository);

  return (
    <div class="commit-panel">
      <Show when={workspace.projects.length > 0} fallback={<div class="empty-state">Open a folder to view source-control changes.</div>}>
        <Show when={git.available !== false} fallback={<div class="empty-state">{git.problem}</div>}>
          <Show when={!loading()} fallback={<div class="empty-state">Reading repository status…</div>}>
            <Show when={repositories().length > 0} fallback={<div class="empty-state">No Git repository was found in the workspace.</div>}>
              <div class="commit-toolbar" role="toolbar" aria-label="Commit view">
                <button
                  type="button"
                  class="commit-view-button"
                  aria-pressed={commitState.view === 'list'}
                  title="View as list"
                  onClick={() => setCommitView('list')}
                >
                  List
                </button>
                <button
                  type="button"
                  class="commit-view-button"
                  aria-pressed={commitState.view === 'tree'}
                  title="Group by folder"
                  onClick={() => setCommitView('tree')}
                >
                  Tree
                </button>
              </div>
              <div class="commit-changes">
                <For each={shown()}>
                  {(repository) => (
                    <RepositorySection
                      repository={repository}
                      showName={repositories().length > 1}
                      onOpenChange={props.onOpenChange}
                      onOpenFile={props.onOpenFile}
                    />
                  )}
                </For>
                <Show when={shown().length === 0}>
                  <div class="commit-repository-empty">No changes</div>
                </Show>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
