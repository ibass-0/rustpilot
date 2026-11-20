import { For, Show, type JSX } from 'solid-js';
import { git, stagePaths, unstagePaths } from '../../application/gitStore';
import { fileNameOf } from '../../domain/fs';
import type { GitChange } from '../../domain/git';
import { FileTypeIcon } from '../icons/FileTypeIcon';
import { MinimizeIcon, PlusIcon } from '../layout/icons';

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
}): JSX.Element {
  const run = (paths: string[]) => (props.action === 'stage' ? stagePaths(paths) : unstagePaths(paths));
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
                disabled={git.busy}
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
              <div class="commit-change" role="listitem" title={change.path}>
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
                    disabled={git.busy}
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

export function CommitPanel(): JSX.Element {
  const conflicts = () => git.status.changes.filter((change) => change.kind === 'conflicted');
  const staged = () => git.status.changes.filter((change) => change.staged && change.kind !== 'conflicted');
  const changes = () => git.status.changes.filter((change) => !change.staged && change.kind !== 'conflicted');

  return (
    <div class="commit-panel">
      <Show when={git.root} fallback={<div class="empty-state">Open a folder to view source-control changes.</div>}>
        <Show when={!git.loading} fallback={<div class="empty-state">Reading repository status…</div>}>
          <Show when={!git.error} fallback={<div class="empty-state">{git.error}</div>}>
            <Show when={git.status.isRepository} fallback={<div class="empty-state">The open folder is not a Git repository.</div>}>
              <div class="commit-summary">
                <span class="commit-branch">{git.status.branch ?? 'Unknown HEAD'}</span>
                <Show when={git.status.upstream}>
                  <span class="commit-upstream">
                    {git.status.upstream}
                    <Show when={git.status.ahead > 0}> ↑{git.status.ahead}</Show>
                    <Show when={git.status.behind > 0}> ↓{git.status.behind}</Show>
                  </span>
                </Show>
              </div>
              <div class="commit-changes">
                <ChangeSection title="Merge Conflicts" changes={conflicts()} action={null} />
                <ChangeSection title="Staged Changes" changes={staged()} action="unstage" />
                <ChangeSection title="Changes" changes={changes()} action="stage" />
                <Show when={git.status.changes.length === 0}>
                  <div class="empty-state">No changes in the working tree.</div>
                </Show>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
