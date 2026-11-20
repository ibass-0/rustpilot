import { createMemo, createSignal, For, onCleanup, onMount, Show, type JSX } from 'solid-js';

export interface PaletteCommand {
  id: string;
  label: string;
  shortcut?: string;
  run: () => void;
}

function matches(query: string, command: PaletteCommand): boolean {
  const text = `${command.label} ${command.id}`.toLowerCase();
  let position = 0;
  for (const character of query.toLowerCase()) {
    position = text.indexOf(character, position);
    if (position < 0) return false;
    position++;
  }
  return true;
}

export function CommandPalette(props: { commands: PaletteCommand[]; onClose: () => void }): JSX.Element {
  const [query, setQuery] = createSignal('');
  const [selected, setSelected] = createSignal(0);
  let input!: HTMLInputElement;
  const filtered = createMemo(() => props.commands.filter((command) => matches(query(), command)));

  const runSelected = () => {
    const command = filtered()[selected()];
    if (!command) return;
    props.onClose();
    command.run();
  };

  onMount(() => {
    input.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        props.onClose();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelected((value) => Math.min(value + 1, Math.max(filtered().length - 1, 0)));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelected((value) => Math.max(value - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        runSelected();
      }
    };
    input.addEventListener('keydown', onKeyDown);
    onCleanup(() => input.removeEventListener('keydown', onKeyDown));
  });

  return (
    <div class="palette-backdrop" onClick={props.onClose}>
      <section class="command-palette" role="dialog" aria-modal="true" aria-label="Command Palette" onClick={(event) => event.stopPropagation()}>
        <input
          ref={input}
          class="palette-input"
          type="search"
          value={query()}
          placeholder="Type a command to search…"
          aria-label="Search commands"
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setSelected(0);
          }}
        />
        <div class="palette-results" role="listbox">
          <For each={filtered()} fallback={<div class="palette-empty">No matching commands.</div>}>
            {(command, index) => (
              <button
                type="button"
                class="palette-command"
                classList={{ selected: selected() === index() }}
                role="option"
                aria-selected={selected() === index()}
                onMouseEnter={() => setSelected(index())}
                onClick={() => {
                  props.onClose();
                  command.run();
                }}
              >
                <span>{command.label}</span>
                <Show when={command.shortcut}><kbd>{command.shortcut}</kbd></Show>
              </button>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}
