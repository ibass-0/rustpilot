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
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);
  onCleanup(() => {
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div class="main-menu" ref={root}>
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
