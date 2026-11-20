import { createSignal, For, onCleanup, Show, type JSX } from 'solid-js';
import { MenuIcon } from './icons';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Draw a divider above this item. */
  separated?: boolean;
}

/** The application menu button in the title bar. */
export function MainMenu(props: { items: MenuItem[] }): JSX.Element {
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
    <div class="main-menu" ref={root}>
      <nav class="menu-bar" aria-label="Application menu">
        <button type="button" class="menu-bar-item menu-bar-file" onClick={() => setOpen((value) => !value)}>File</button>
        <button type="button" class="menu-bar-item" title="Edit commands">Edit</button>
        <button type="button" class="menu-bar-item" title="View commands">View</button>
        <button type="button" class="menu-bar-item" title="Navigate commands">Navigate</button>
        <button type="button" class="menu-bar-item" title="Run commands">Run</button>
        <button type="button" class="menu-bar-item" title="Help commands">Help</button>
      </nav>
      <button
        type="button"
        class="title-button"
        title="Main Menu"
        aria-label="Main Menu"
        aria-haspopup="menu"
        aria-expanded={open()}
        onClick={() => setOpen((value) => !value)}
      >
        <MenuIcon />
      </button>
      <Show when={open()}>
        <div class="menu" role="menu">
          <For each={props.items}>
            {(item) => (
              <>
                <Show when={item.separated}>
                  <div class="menu-separator" role="separator" />
                </Show>
                <button
                  type="button"
                  class="menu-item"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.label}
                </button>
              </>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
