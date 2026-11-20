import { createSignal, For, Show, type JSX } from 'solid-js';
import { git, stageInRepository, unstageInRepository, type RepositoryState } from '../../application/gitStore';
import { workspace } from '../../application/workspaceStore';
import { fileNameOf } from '../../domain/fs';
import { repositoryKey, repositoryLabel, type GitChange } from '../../domain/git';
import { FileTypeIcon } from '../icons/FileTypeIcon';
import { ChevronIcon, MinimizeIcon, PlusIcon } from '../layout/icons';

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

function ChangeSection(props: {
  title: string;
  changes: GitChange[];
  action: 'stage' | 'unstage' | null;
  repository: RepositoryState;
  onOpenChange: (repositoryRoot: string, path: string, staged: boolean) => void;
}): JSX.Element {
  const run = (paths: string[]) =>
    props.action === 'stage'
      ? stageInRepository(props.repository.root, paths)
      : unstageInRepository(props.repository.root, paths);
  const open = (change: GitChange) => props.onOpenChange(props.repository.root, change.path, change.staged);
  return (
    <Show when={props.changes.length > 0}>
      <section class="commit-section">
        <header class="commit-section-header">
          <span>{props.title}</span>
          <div class="commit-section-actions">
            <Show when={props.action}>
              <button
                type="button"
                class="commit-group-action"
                title={`${props.action === 'stage' ? 'Stage' : 'Unstage'} All`}
                aria-label={`${props.action === 'stage' ? 'Stage' : 'Unstage'} All`}
                disabled={props.repository.busy}
                onClick={() => void run([...new Set(props.changes.flatMap(operationPaths))])}
              >
                {props.action === 'stage' ? <PlusIcon size={14} /> : <MinimizeIcon size={14} />}
              </button>
            </Show>
            <span class="commit-count">{props.changes.length}</span>
          </div>
        </header>
        <div role="list">
          <For each={props.changes}>
            {(change) => (
              <div
                class="commit-change"
                role="listitem"
                title={`Open diff for ${change.path}`}
                tabindex="0"
                onClick={() => open(change)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    open(change);
                  }
                }}
              >
                <FileTypeIcon name={change.path} size={16} />
                <span class="commit-change-name">{labelOf(change)}</span>
                <span class="commit-change-path">{parentOf(change.path)}</span>
                <span class={`commit-change-kind kind-${change.kind}`}>{markerOf(change)}</span>
                <Show when={props.action}>
                  <button
                    type="button"
                    class="commit-file-action"
                    title={`${props.action === 'stage' ? 'Stage' : 'Unstage'} ${change.path}`}
                    aria-label={`${props.action === 'stage' ? 'Stage' : 'Unstage'} ${change.path}`}
                    disabled={props.repository.busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      void run(operationPaths(change));
                    }}
                  >
                    {props.action === 'stage' ? <PlusIcon size={13} /> : <MinimizeIcon size={13} />}
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}

/** One repository: its branch, and its changes grouped as conflicts, staged and working-tree changes. */
function RepositorySection(props: {
  repository: RepositoryState;
  showName: boolean;
  onOpenChange: (repositoryRoot: string, path: string, staged: boolean) => void;
}): JSX.Element {
  const [collapsed, setCollapsed] = createSignal(false);
  const changes = () => props.repository.status.changes;
  const conflicts = () => changes().filter((change) => change.kind === 'conflicted');
  const staged = () => changes().filter((change) => change.staged && change.kind !== 'conflicted');
  const working = () => changes().filter((change) => !change.staged && change.kind !== 'conflicted');
  return (
    <section class="commit-repository" data-repository={repositoryKey(props.repository.root)}>
      <button
        type="button"
        class="commit-summary commit-summary-button"
        aria-expanded={!collapsed()}
        title={props.repository.root}
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
        <span class="commit-count">{changes().length}</span>
      </button>
      <Show when={props.repository.error}>{(message) => <div class="commit-repository-error" role="alert">{message()}</div>}</Show>
      <Show when={!collapsed()}>
        <ChangeSection title="Merge Conflicts" changes={conflicts()} action={null} repository={props.repository} onOpenChange={props.onOpenChange} />
        <ChangeSection title="Staged Changes" changes={staged()} action="unstage" repository={props.repository} onOpenChange={props.onOpenChange} />
        <ChangeSection title="Changes" changes={working()} action="stage" repository={props.repository} onOpenChange={props.onOpenChange} />
      </Show>
    </section>
  );
}

/** The Commit tool window: every repository of every project in the workspace that has something to show. */
export function CommitPanel(props: { onOpenChange: (repositoryRoot: string, path: string, staged: boolean) => void }): JSX.Element {
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
              <div class="commit-changes">
                <For each={shown()}>
                  {(repository) => (
                    <RepositorySection repository={repository} showName={repositories().length > 1} onOpenChange={props.onOpenChange} />
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
