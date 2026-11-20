import { createStore } from 'solid-js/store';
import { toAppError } from '../domain/fs';
import {
  exitNotice,
  INITIAL_TERMINAL_SIZE,
  neighbourAfterClose,
  tabTitle,
  type ShellProfile,
  type TerminalSize,
  type TerminalTab,
} from '../domain/terminal';
import { ports } from './ports';
import { workspace } from './workspaceStore';

export interface TerminalState {
  /** Shells installed on this machine; the first is the default. */
  shells: ShellProfile[];
  tabs: TerminalTab[];
  activeId: number | null;
}

const [state, setState] = createStore<TerminalState>({ shells: [], tabs: [], activeId: null });

/** Read-only view of the open terminals. */
export const terminals: TerminalState = state;

let nextId = 1;
/** Terminals whose shell has finished starting. */
const started = new Set<number>();
/** What was typed (or answered by the screen) before the shell had finished starting. */
const earlyInput = new Map<number, string[]>();
/** The latest size each screen reported. */
const sizes = new Map<number, TerminalSize>();

const findTab = (id: number): TerminalTab | undefined => state.tabs.find((tab) => tab.id === id);
const ignore = () => {};

let loadingShells: Promise<void> | null = null;

/** Ask the backend which shells are installed. Calls made while one is in flight share it. */
export function loadShells(): Promise<void> {
  loadingShells ??= ports()
    .pty.listShells()
    .then((shells) => setState('shells', shells))
    .finally(() => {
      loadingShells = null;
    });
  return loadingShells;
}

function forget(id: number): void {
  started.delete(id);
  earlyInput.delete(id);
  sizes.delete(id);
}

function removeTab(id: number): void {
  const next = neighbourAfterClose(
    state.tabs.map((tab) => tab.id),
    id,
    state.activeId,
  );
  setState('activeId', next);
  setState('tabs', (tabs) => tabs.filter((tab) => tab.id !== id));
  ports().screens.dispose(id);
  forget(id);
}

function onInput(id: number, data: string): void {
  const tab = findTab(id);
  if (!tab || tab.exited) return;
  if (started.has(id)) {
    void ports().pty.write(id, data).catch(ignore);
  } else {
    // The shell is still starting. Keep the input: the screen's reply to the
    // terminal's start-up query must not be lost, or the shell never proceeds.
    const queue = earlyInput.get(id) ?? [];
    queue.push(data);
    earlyInput.set(id, queue);
  }
}

function onResize(id: number, size: TerminalSize): void {
  const tab = findTab(id);
  if (!tab || tab.exited) return;
  sizes.set(id, size);
  if (started.has(id)) void ports().pty.resize(id, size).catch(ignore);
}

/** Tell the backend the screen has caught up to `seq`, so it may send more. */
function acknowledge(id: number, seq: number): void {
  const tab = findTab(id);
  if (!tab || tab.exited) return;
  void ports().pty.acknowledge(id, seq).catch(ignore);
}

function onExit(id: number, code: number): void {
  if (!findTab(id)) return;
  setState('tabs', (tab) => tab.id === id, 'exited', true);
  started.delete(id);
  earlyInput.delete(id);
  ports().screens.write(id, exitNotice(code));
}

/** Open a terminal with the given shell, or the default one, in the workspace folder. */
export async function openTerminal(profileId?: string): Promise<void> {
  // Detect the shells afresh each time: it is cheap, and one may have been installed or removed.
  await loadShells();
  const profile = profileId ? state.shells.find((shell) => shell.id === profileId) : state.shells[0];
  if (!profile) {
    await ports().dialog.showError(
      profileId ? `The shell "${profileId}" is not installed.` : 'No shell was found on this computer.',
    );
    return;
  }

  const id = nextId++;
  // The screen comes first so that nothing the shell prints at start-up is lost.
  ports().screens.create(id, {
    onInput: (data) => onInput(id, data),
    onResize: (size) => onResize(id, size),
  });
  const title = tabTitle(
    profile.name,
    state.tabs.map((tab) => tab.title),
  );
  setState('tabs', state.tabs.length, { id, title, profileId: profile.id, exited: false });
  setState('activeId', id);

  try {
    await ports().pty.open(
      id,
      profile.id,
      workspace.root,
      INITIAL_TERMINAL_SIZE,
      (data, seq) => ports().screens.write(id, data, () => acknowledge(id, seq)),
      (code) => onExit(id, code),
    );
  } catch (err) {
    if (findTab(id)) removeTab(id);
    await ports().dialog.showError(toAppError(err).message);
    return;
  }

  const tab = findTab(id);
  if (!tab) {
    // The tab was closed while its shell was starting; do not leave the shell running.
    void ports().pty.close(id).catch(ignore);
    return;
  }
  if (tab.exited) return;

  started.add(id);
  for (const data of earlyInput.get(id) ?? []) void ports().pty.write(id, data).catch(ignore);
  earlyInput.delete(id);

  const size = sizes.get(id);
  if (size && (size.cols !== INITIAL_TERMINAL_SIZE.cols || size.rows !== INITIAL_TERMINAL_SIZE.rows)) {
    void ports().pty.resize(id, size).catch(ignore);
  }
}

let ensuring: Promise<void> | null = null;

/** Make sure there is at least one terminal, opening the default shell if there is none. */
export function ensureTerminal(): Promise<void> {
  if (state.tabs.length > 0) return Promise.resolve();
  ensuring ??= openTerminal().finally(() => {
    ensuring = null;
  });
  return ensuring;
}

export function activateTerminal(id: number): void {
  if (findTab(id)) setState('activeId', id);
}

export async function runTerminalCommand(command: string): Promise<void> {
  await ensureTerminal();
  if (state.activeId !== null) await ports().pty.write(state.activeId, `${command}\r`);
}

/** Close a terminal, ending its shell if it is still running. */
export async function closeTerminal(id: number): Promise<void> {
  const tab = findTab(id);
  if (!tab) return;
  const running = !tab.exited;
  removeTab(id);
  if (running) await ports().pty.close(id).catch(ignore);
}
