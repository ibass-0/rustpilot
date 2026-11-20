import { createStore, produce } from 'solid-js/store';
import { nextHistoryIndex, rememberMessage, validateCommit } from '../domain/commit';
import { repositoryKey } from '../domain/git';
import { commitInRepository, git, lastCommitMessage } from './gitStore';
import { ports } from './ports';

const HISTORY_KEY = 'rustpilot.git.messageHistory';
const VIEW_KEY = 'rustpilot.git.commitView';
const HISTORY_LIMIT = 20;

export interface CommitDraft {
  message: string;
  amend: boolean;
  signOff: boolean;
  /** `-1` while typing, otherwise the position in the history being browsed. */
  historyIndex: number;
  /** What was typed before browsing the history started, so it can be returned to. */
  typed: string;
  error: string | null;
}

interface CommitStoreState {
  drafts: Record<string, CommitDraft>;
  history: string[];
  /** How the Commit panel lists changes. */
  view: 'list' | 'tree';
}

const blankDraft = (): CommitDraft => ({ message: '', amend: false, signOff: false, historyIndex: -1, typed: '', error: null });

const [state, setState] = createStore<CommitStoreState>({ drafts: {}, history: [], view: 'list' });

/** Read-only view of the commit message drafts, one per repository, and the message history. */
export const commitState: CommitStoreState = state;

/** The draft of a repository; a blank one when nothing was typed yet. */
export const commitDraft = (key: string): CommitDraft => state.drafts[key] ?? blankDraft();

function edit(key: string, change: (draft: CommitDraft) => void): void {
  setState(
    produce((s) => {
      change((s.drafts[key] ??= blankDraft()));
    }),
  );
}

export function loadCommitHistory(): void {
  let history: string[] = [];
  try {
    const value: unknown = JSON.parse(ports().storage.get(HISTORY_KEY) ?? '[]');
    if (Array.isArray(value)) history = value.filter((item): item is string => typeof item === 'string').slice(0, HISTORY_LIMIT);
  } catch {
    history = [];
  }
  setState('history', history);
  setState('view', ports().storage.get(VIEW_KEY) === 'tree' ? 'tree' : 'list');
}

export function setCommitView(view: 'list' | 'tree'): void {
  setState('view', view);
  ports().storage.set(VIEW_KEY, view);
}

/** Forget every draft and the in-memory history. Used by tests. */
export function resetCommit(): void {
  setState({ drafts: {}, history: [], view: 'list' });
}

export function setMessage(key: string, message: string): void {
  edit(key, (draft) => {
    draft.message = message;
    draft.historyIndex = -1;
    draft.error = null;
  });
}

export function setSignOff(key: string, signOff: boolean): void {
  edit(key, (draft) => {
    draft.signOff = signOff;
  });
}

/** Turning amend on with an empty box fills in the message of the last commit, ready to be edited. */
export async function setAmend(key: string, amend: boolean): Promise<void> {
  edit(key, (draft) => {
    draft.amend = amend;
    draft.error = null;
  });
  const repository = git.repositories[key];
  if (amend && repository && commitDraft(key).message.trim() === '') {
    const previous = await lastCommitMessage(repository.root);
    if (previous !== null && commitDraft(key).amend && commitDraft(key).message.trim() === '') {
      edit(key, (draft) => {
        draft.message = previous;
      });
    }
  }
}

/** Step through earlier messages with the arrow keys; stepping newer past the first returns to what was typed. */
export function browseHistory(key: string, direction: 'older' | 'newer'): void {
  const draft = commitDraft(key);
  const index = nextHistoryIndex(draft.historyIndex, state.history.length, direction);
  if (index === draft.historyIndex) return;
  edit(key, (d) => {
    if (d.historyIndex === -1) d.typed = d.message;
    d.historyIndex = index;
    d.message = index === -1 ? d.typed : state.history[index];
    d.error = null;
  });
}

/** Commit what is staged in the repository at `root`. Gives `true` when the commit was made. */
export async function commitRepository(root: string): Promise<boolean> {
  const key = repositoryKey(root);
  const repository = git.repositories[key];
  if (!repository) return false;
  const draft = commitDraft(key);
  const stagedCount = repository.status.changes.filter((change) => change.staged).length;
  const problem = validateCommit(draft.message, { amend: draft.amend, stagedCount });
  if (problem) {
    edit(key, (d) => {
      d.error = problem;
    });
    return false;
  }
  const done = await commitInRepository(root, draft.message, draft.amend, draft.signOff);
  if (!done) {
    edit(key, (d) => {
      d.error = git.repositories[key]?.error ?? 'The commit failed.';
    });
    return false;
  }
  const history = rememberMessage(state.history, draft.message, HISTORY_LIMIT);
  setState('history', history);
  ports().storage.set(HISTORY_KEY, JSON.stringify(history));
  edit(key, (d) => {
    d.message = '';
    d.amend = false;
    d.historyIndex = -1;
    d.typed = '';
    d.error = null;
  });
  return true;
}
