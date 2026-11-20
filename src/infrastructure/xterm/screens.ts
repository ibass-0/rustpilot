import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import type { TerminalScreenHandlers, TerminalScreenPort } from '../../application/ports';
import { terminalFont, terminalTheme } from './theme';

/**
 * `TerminalScreenPort` backed by xterm.js. Each terminal owns an element and
 * its own scrollback; one of them at a time is shown inside the host element.
 * xterm is loaded on first use, so it costs nothing until a terminal opens.
 */
export interface XtermScreens extends TerminalScreenPort {
  /** Show the screen `id` (or none) inside `host`. */
  attach(id: number | null, host: HTMLElement): void;
  /** Re-measure the shown screen against its host. */
  fit(): void;
  focus(): void;
}

interface Screen {
  handlers: TerminalScreenHandlers;
  element: HTMLDivElement;
  terminal: Terminal | null;
  fitter: FitAddon | null;
  /** Output that arrived before xterm finished loading. */
  pending: Array<{ data: string; onProcessed?: () => void }>;
  /** Whether the terminal has been rendered into its element yet. */
  opened: boolean;
}

type Library = { Terminal: typeof Terminal; FitAddon: typeof FitAddon };

const SCROLLBACK_LINES = 5000;

export function createXtermScreens(): XtermScreens {
  const screens = new Map<number, Screen>();
  let host: HTMLElement | null = null;
  let shownId: number | null = null;
  let library: Promise<Library> | null = null;

  const loadLibrary = (): Promise<Library> =>
    (library ??= Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/xterm/css/xterm.css'),
    ]).then(([xterm, fit]) => ({ Terminal: xterm.Terminal, FitAddon: fit.FitAddon })));

  /** Copy and paste the way Windows Terminal does; everything else goes to the shell. */
  const handleKey = (terminal: Terminal, event: KeyboardEvent): boolean => {
    if (event.type !== 'keydown' || !event.ctrlKey || event.altKey) return true;
    const key = event.key.toLowerCase();
    if (key === 'c' && (event.shiftKey || terminal.hasSelection())) {
      event.preventDefault();
      void navigator.clipboard.writeText(terminal.getSelection()).catch(() => {});
      terminal.clearSelection();
      return false;
    }
    // Let the browser paste into xterm's input, which forwards it to the shell.
    if (key === 'v') return false;
    return true;
  };

  const fitShown = () => {
    const screen = shownId === null ? undefined : screens.get(shownId);
    if (!screen?.terminal || !screen.fitter || !screen.opened) return;
    // A hidden or collapsed host has no size to measure.
    if (screen.element.offsetWidth === 0 || screen.element.offsetHeight === 0) return;
    screen.fitter.fit();
  };

  /** Render the screen into its element the first time it is shown, then size and focus it. */
  const present = (screen: Screen) => {
    if (!screen.terminal || !screen.element.isConnected) return;
    if (!screen.opened) {
      screen.terminal.open(screen.element);
      screen.opened = true;
    }
    fitShown();
    screen.terminal.focus();
  };

  return {
    create(id, handlers) {
      const element = document.createElement('div');
      element.className = 'terminal-screen';
      element.hidden = true;
      const screen: Screen = { handlers, element, terminal: null, fitter: null, pending: [], opened: false };
      screens.set(id, screen);

      void loadLibrary().then(({ Terminal, FitAddon }) => {
        // The terminal may have been closed while the library was loading.
        if (screens.get(id) !== screen) return;
        const terminal = new Terminal({
          fontFamily: terminalFont(),
          fontSize: 13,
          lineHeight: 1.2,
          cursorBlink: true,
          scrollback: SCROLLBACK_LINES,
          theme: terminalTheme(),
          windowsPty: { backend: 'conpty' },
        });
        const fitter = new FitAddon();
        terminal.loadAddon(fitter);
        terminal.onData((data) => handlers.onInput(data));
        terminal.onResize(({ cols, rows }) => handlers.onResize({ cols, rows }));
        terminal.attachCustomKeyEventHandler((event) => handleKey(terminal, event));
        screen.terminal = terminal;
        screen.fitter = fitter;

        for (const { data, onProcessed } of screen.pending) terminal.write(data, onProcessed);
        screen.pending = [];
        if (shownId === id) present(screen);
      });
    },

    write(id, data, onProcessed) {
      const screen = screens.get(id);
      if (!screen) return;
      // xterm calls back once it has parsed the data; that is what paces the shell.
      if (screen.terminal) screen.terminal.write(data, onProcessed);
      else screen.pending.push({ data, onProcessed });
    },

    dispose(id) {
      const screen = screens.get(id);
      if (!screen) return;
      screens.delete(id);
      screen.terminal?.dispose();
      screen.element.remove();
      if (shownId === id) shownId = null;
    },

    attach(id, nextHost) {
      host = nextHost;
      shownId = id;
      for (const [screenId, screen] of screens) {
        screen.element.hidden = screenId !== id;
        if (screenId === id && screen.element.parentElement !== host) host.appendChild(screen.element);
      }
      const screen = id === null ? undefined : screens.get(id);
      if (screen) present(screen);
    },

    fit: fitShown,

    focus() {
      const screen = shownId === null ? undefined : screens.get(shownId);
      screen?.terminal?.focus();
    },
  };
}
