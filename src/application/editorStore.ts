import { createStore } from 'solid-js/store';
import { nextActivePath, openErrorMessage, type CursorPosition, type Tab } from '../domain/editor';
import { fileNameOf, toAppError } from '../domain/fs';
import { ports } from './ports';
import { rememberFile } from './recentStore';

export interface EditorStoreState {
  tabs: Tab[];
  activePath: string | null;
  cursor: CursorPosition;
}

const [state, setState] = createStore<EditorStoreState>({
  tabs: [],
  activePath: null,
  cursor: { line: 1, col: 1 },
});

/** Read-only view of the open tabs. */
export const editor: EditorStoreState = state;

const findTab = (path: string): Tab | undefined => state.tabs.find((tab) => tab.path === path);
const autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const AUTOSAVE_DELAY_MS = 1500;

/** Open a file in a new tab, or activate its tab if it is already open. */
export async function openFile(path: string): Promise<void> {
  if (findTab(path)) {
    activateTab(path);
    return;
  }
  const name = fileNameOf(path);
  const activeAtStart = state.activePath;
  try {
    const content = await ports().fs.readTextFile(path);
    // The same file may have been opened again while this read was in flight.
    if (!findTab(path)) {
      ports().buffers.open(path, content.text);
      setState('tabs', state.tabs.length, { path, name, lineEnding: content.lineEnding, dirty: false });
    }
    rememberFile(path);
    // If the user moved to another tab while a slow file was loading, leave them there.
    if (state.activePath === activeAtStart) activateTab(path);
  } catch (err) {
    await ports().dialog.showError(openErrorMessage(name, toAppError(err)));
  }
}

export function activateTab(path: string): void {
  if (findTab(path)) setState('activePath', path);
}

export function markDirty(path: string): void {
  setState('tabs', (tab) => tab.path === path, 'dirty', true);
  const previous = autosaveTimers.get(path);
  if (previous) clearTimeout(previous);
  autosaveTimers.set(path, setTimeout(() => {
    autosaveTimers.delete(path);
    void saveTab(path);
  }, AUTOSAVE_DELAY_MS));
}

/** Save every dirty editor, used when the application loses focus. */
export function saveDirtyTabs(): Promise<boolean[]> {
  return Promise.all(state.tabs.filter((tab) => tab.dirty).map((tab) => saveTab(tab.path)));
}

/** The save in flight for each path, so that saves of one file never overlap. */
const saving = new Map<string, Promise<boolean>>();

/**
 * Write a tab's buffer to disk. Resolves to `false`, leaving the tab dirty,
 * when the write fails. A save requested while another is still running for
 * the same file waits for it, so an older write can never land last.
 */
export function saveTab(path: string): Promise<boolean> {
  const previous = saving.get(path) ?? Promise.resolve(true);
  const next = previous.then(() => writeTab(path));
  saving.set(path, next);
  void next.finally(() => {
    if (saving.get(path) === next) saving.delete(path);
  });
  return next;
}

async function writeTab(path: string): Promise<boolean> {
  const tab = findTab(path);
  if (!tab) return false;
  // Nothing to write: saving a clean tab must not overwrite a file that changed on disk.
  if (!tab.dirty) return true;
  const text = ports().buffers.text(path);
  try {
    await ports().fs.writeTextFile(path, text, tab.lineEnding);
  } catch (err) {
    await ports().dialog.showError(toAppError(err).message);
    return false;
  }
  // Edits made while the write was in flight are not on disk yet.
  if (ports().buffers.has(path) && ports().buffers.text(path) === text) {
    setState('tabs', (t) => t.path === path, 'dirty', false);
  }
  return true;
}

/** Close a tab, asking first when it has unsaved changes. Resolves to `false` when the user cancels. */
export async function closeTab(path: string): Promise<boolean> {
  const tab = findTab(path);
  if (!tab) return false;
  if (tab.dirty && !(await ports().dialog.confirmDiscard(tab.name))) return false;

  const next = nextActivePath(state.tabs, path, state.activePath);
  setState('activePath', next);
  setState('tabs', (tabs) => tabs.filter((t) => t.path !== path));
  ports().buffers.close(path);
  return true;
}

export function hasDirtyTabs(): boolean {
  return state.tabs.some((tab) => tab.dirty);
}

export function setCursor(line: number, col: number): void {
  setState('cursor', { line, col });
}

/** Whether the window may close. Asks first when any tab has unsaved changes. */
export async function confirmWindowClose(): Promise<boolean> {
  const dirty = state.tabs.filter((tab) => tab.dirty);
  if (dirty.length === 0) return true;
  const subject = dirty.length === 1 ? dirty[0].name : `${dirty.length} files`;
  return ports().dialog.confirmDiscard(subject);
}
