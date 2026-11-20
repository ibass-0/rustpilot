import { createSignal, For, onCleanup, Show, type JSX } from 'solid-js';
import { APP_MENUS, type MenuEntry } from '../../domain/menuModel';

/** What an item does when chosen, by item id. Items without an action are shown disabled. */
export type MenuActions = Record<string, () => void>;

const UPCOMING = 'Coming in a later phase';

function MenuList(props: { entries: readonly MenuEntry[]; actions: MenuActions; onChoose: () => void }): JSX.Element {
  return (
    <For each={props.entries}>
      {(entry) => {
        if (entry.kind === 'separator') return <div class="menu-separator" role="separator" />;
        const action = () => props.actions[entry.id];
        const children = entry.children;
        if (children) {
          return (
            <div class="menu-sub">
              <button type="button" class="menu-item menu-item-row" role="menuitem" aria-haspopup="menu">
                <span class="menu-item-label">{entry.label}</span>
                <span class="menu-item-arrow" aria-hidden="true">▸</span>
              </button>
              <div class="menu menu-flyout" role="menu">
                <MenuList entries={children} actions={props.actions} onChoose={props.onChoose} />
              </div>
            </div>
          );
        }
        return (
          <button
            type="button"
            class="menu-item menu-item-row"
            role="menuitem"
            aria-disabled={action() ? undefined : 'true'}
            title={action() ? undefined : UPCOMING}
            onClick={() => {
              const run = action();
              if (!run) return;
              props.onChoose();
              run();
            }}
          >
            <span class="menu-item-label">{entry.label}</span>
            <Show when={entry.shortcut}>
              <span class="menu-item-shortcut">{entry.shortcut}</span>
            </Show>
          </button>
        );
      }}
    </For>
  );
}

/**
 * The application menu bar. A click opens a menu; while one is open, moving the pointer over another
 * menu opens that one instead, like in VS Code. Escape, a click elsewhere, or choosing an item closes it.
 */
export function MainMenu(props: { actions: MenuActions }): JSX.Element {
  const [openId, setOpenId] = createSignal<string | null>(null);
  let root!: HTMLDivElement;

  const move = (step: 1 | -1) => {
    const current = APP_MENUS.findIndex((menu) => menu.id === openId());
    if (current < 0) return;
    setOpenId(APP_MENUS[(current + step + APP_MENUS.length) % APP_MENUS.length].id);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!root.contains(event.target as Node)) setOpenId(null);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (openId() === null) return;
    if (event.key === 'Escape') setOpenId(null);
    else if (event.key === 'ArrowRight') move(1);
    else if (event.key === 'ArrowLeft') move(-1);
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
        <For each={APP_MENUS}>
          {(menu) => (
            <div class="menu-bar-slot">
              <button
                type="button"
                class="menu-bar-item"
                classList={{ 'is-open': openId() === menu.id }}
                aria-haspopup="menu"
                aria-expanded={openId() === menu.id}
                onClick={() => setOpenId((current) => (current === menu.id ? null : menu.id))}
                // Once a menu is open, just pointing at another one switches to it.
                onPointerEnter={() => {
                  if (openId() !== null) setOpenId(menu.id);
                }}
              >
                {menu.label}
              </button>
              <Show when={openId() === menu.id}>
                <div class="menu menu-dropdown" role="menu">
                  <MenuList entries={menu.entries} actions={props.actions} onChoose={() => setOpenId(null)} />
                </div>
              </Show>
            </div>
          )}
        </For>
      </nav>
    </div>
  );
}
