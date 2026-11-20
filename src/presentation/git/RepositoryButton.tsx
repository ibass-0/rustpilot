import { createSignal, For, onCleanup, Show, type JSX } from 'solid-js';
import { activeRepository, pinRepository } from '../../application/gitContext';
import { git } from '../../application/gitStore';
import { workspace } from '../../application/workspaceStore';
import { repositoryKey, repositoryLabel, type RepositoryKind } from '../../domain/git';
import { BranchIcon, ChevronDownIcon } from '../layout/icons';

const KIND_LABEL: Record<RepositoryKind, string> = { repository: '', submodule: 'submodule', worktree: 'worktree' };

/** `↑2 ↓1` for the commits ahead of and behind the upstream; empty when level. */
function tracking(ahead: number, behind: number): string {
  return [ahead > 0 ? `↑${ahead}` : '', behind > 0 ? `↓${behind}` : ''].filter(Boolean).join(' ');
}

/**
 * The repository and branch of what the user is working on, in the title bar. With several
 * repositories it names the repository too, and a click lists them all.
 */
export function RepositoryButton(props: { onShowGit: () => void }): JSX.Element {
  const [open, setOpen] = createSignal(false);
  let root!: HTMLDivElement;

  const onPointerDown = (event: PointerEvent) => {
    if (!root.contains(event.target as Node)) setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setOpen(false);
  };
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown, true);
  onCleanup(() => {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
  });

  const repositories = () => git.order.map((key) => git.repositories[key]).filter((repository) => repository !== undefined);
  const several = () => repositories().length > 1;

  return (
    <Show when={activeRepository()}>
      {(repository) => (
        <div class="title-repository" ref={root}>
          <button
            type="button"
            class="title-branch"
            aria-haspopup="menu"
            aria-expanded={open()}
            title={`${repository().root}\nBranch: ${repository().status.branch ?? 'detached HEAD'}${repository().status.upstream ? `\nUpstream: ${repository().status.upstream}` : ''}`}
            onClick={() => setOpen((value) => !value)}
          >
            <BranchIcon size={14} />
            <Show when={several()}>
              <span class="title-repository-name">{repositoryLabel(repository(), workspace.projects)}</span>
              <span class="title-repository-sep">/</span>
            </Show>
            <span class="title-branch-name">{repository().status.branch ?? 'HEAD'}</span>
            <Show when={tracking(repository().status.ahead, repository().status.behind)}>
              {(text) => <span class="title-tracking">{text()}</span>}
            </Show>
            <ChevronDownIcon size={14} />
          </button>
          <Show when={open()}>
            <div class="menu repository-popup" role="menu">
              <div class="repository-popup-title">Repositories</div>
              <For each={repositories()}>
                {(item) => (
                  <button
                    type="button"
                    class="menu-item repository-item"
                    role="menuitemradio"
                    aria-checked={repositoryKey(item.root) === repositoryKey(repository().root)}
                    title={item.root}
                    onClick={() => {
                      pinRepository(repositoryKey(item.root));
                      setOpen(false);
                    }}
                  >
                    <span class="repository-item-name">
                      {repositoryLabel(item, workspace.projects)}
                      <Show when={KIND_LABEL[item.kind]}>
                        <span class="repository-item-kind">{KIND_LABEL[item.kind]}</span>
                      </Show>
                    </span>
                    <span class="repository-item-branch">{item.status.branch ?? 'HEAD'}</span>
                    <Show when={tracking(item.status.ahead, item.status.behind)}>
                      {(text) => <span class="repository-item-tracking">{text()}</span>}
                    </Show>
                    <Show when={item.status.changes.length > 0}>
                      <span class="repository-item-count">{item.status.changes.length}</span>
                    </Show>
                  </button>
                )}
              </For>
              <div class="menu-separator" role="separator" />
              <button
                type="button"
                class="menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  props.onShowGit();
                }}
              >
                Open Git Tool Window
              </button>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
