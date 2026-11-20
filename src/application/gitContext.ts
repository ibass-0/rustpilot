import { createSignal } from 'solid-js';
import { editor } from './editorStore';
import { git, repositoryOfPath, type RepositoryState } from './gitStore';

/** A repository chosen by hand, valid only while the tab it was chosen in stays active. */
const [pinned, setPinned] = createSignal<{ tab: string | null; key: string } | null>(null);

/** Make `key` the active repository until the active tab changes. Unknown keys are ignored. */
export function pinRepository(key: string): void {
  if (git.repositories[key]) setPinned({ tab: editor.activePath, key });
}

/**
 * The repository the user is working in: the one chosen by hand, else the one that holds the file
 * in the active tab, else the first repository of the workspace.
 */
export function activeRepository(): RepositoryState | null {
  const choice = pinned();
  if (choice && choice.tab === editor.activePath && git.repositories[choice.key]) return git.repositories[choice.key];
  const path = editor.activePath;
  const owner = path ? repositoryOfPath(path) : null;
  if (owner) return owner;
  const first = git.order[0];
  return first ? git.repositories[first] : null;
}
