import { createEffect, createSignal, For, onCleanup, onMount, Show, type JSX } from 'solid-js';
import {
  activateTerminal,
  closeTerminal,
  ensureTerminal,
  loadShells,
  openTerminal,
  terminals,
} from '../../application/terminalStore';
import { ChevronDownIcon, CloseIcon, PlusIcon, TerminalIcon } from '../layout/icons';

/** What the panel needs from the terminal emulator. */
export interface TerminalSurface {
  /** Show the screen `id` (or none) inside `host`. */
  attach(id: number | null, host: HTMLElement): void;
  /** Re-measure the shown screen against its host. */
  fit(): void;
  focus(): void;
}

const MIDDLE_BUTTON = 1;

/** The shell picker: a menu listing every installed shell. */
function ShellMenu(): JSX.Element {
  const [open, setOpen] = createSignal(false);
  let root!: HTMLDivElement;

  const onPointerDown = (event: PointerEvent) => {
    if (!root.contains(event.target as Node)) setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setOpen(false);
  };
  // Capture phase: the terminal swallows key presses, and Escape must still close the menu.
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown, true);
  onCleanup(() => {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
  });

  return (
    <div class="shell-menu" ref={root}>
      <button
        type="button"
        class="icon-button"
        title="Choose a Shell"
        aria-label="Choose a Shell"
        aria-haspopup="menu"
        aria-expanded={open()}
        onClick={() => {
          void loadShells();
          setOpen((value) => !value);
        }}
      >
        <ChevronDownIcon size={14} />
      </button>
      <Show when={open()}>
        <div class="menu" role="menu">
          <For each={terminals.shells} fallback={<div class="menu-empty">No shell found</div>}>
            {(shell) => (
              <button
                type="button"
                class="menu-item"
                role="menuitem"
                title={shell.program}
                onClick={() => {
                  setOpen(false);
                  void openTerminal(shell.id);
                }}
              >
                {shell.name}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

/** The terminal tabs and the "new terminal" controls, shown in the tool window header. */
export function TerminalTabs(): JSX.Element {
  return (
    <div class="terminal-tabs">
      <div class="terminal-tab-list" role="tablist">
        <For each={terminals.tabs}>
          {(tab) => (
            <div
              class="terminal-tab"
              role="tab"
              aria-selected={terminals.activeId === tab.id}
              data-exited={tab.exited ? '' : undefined}
              title={tab.exited ? `${tab.title} (exited)` : tab.title}
              onClick={() => activateTerminal(tab.id)}
              onMouseDown={(event) => {
                if (event.button === MIDDLE_BUTTON) event.preventDefault();
              }}
              onAuxClick={(event) => {
                if (event.button === MIDDLE_BUTTON) void closeTerminal(tab.id);
              }}
            >
              <span class="terminal-tab-title">{tab.title}</span>
              <button
                type="button"
                class="tab-close"
                aria-label={`Close ${tab.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void closeTerminal(tab.id);
                }}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          )}
        </For>
      </div>
      <button
        type="button"
        class="icon-button"
        title="New Terminal"
        aria-label="New Terminal"
        onClick={() => void openTerminal()}
      >
        <PlusIcon />
      </button>
      <ShellMenu />
    </div>
  );
}

/** The body of the Terminal tool window: the active terminal's screen. */
export function TerminalPanel(props: { surface: TerminalSurface }): JSX.Element {
  let host!: HTMLDivElement;

  onMount(() => {
    // Opening the tool window is the moment a terminal is wanted.
    void loadShells();
    void ensureTerminal();

    createEffect(() => {
      props.surface.attach(terminals.activeId, host);
    });

    const observer = new ResizeObserver(() => props.surface.fit());
    observer.observe(host);
    onCleanup(() => observer.disconnect());
  });

  return (
    <>
      <div class="terminal-host" ref={host} hidden={terminals.activeId === null} onClick={() => props.surface.focus()} />
      <Show when={terminals.activeId === null}>
        <div class="empty-state">
          <TerminalIcon size={28} />
          <span>No terminal is open.</span>
          <button type="button" class="button button-primary" onClick={() => void openTerminal()}>
            New Terminal
          </button>
        </div>
      </Show>
    </>
  );
}
