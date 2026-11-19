type Handler = () => void;

const handlers = new Map<string, Set<Handler>>();
let listening = false;

const MODIFIER_ORDER = ['ctrl', 'alt', 'shift'] as const;

function normalize(combo: string): string {
  const parts = combo.toLowerCase().split('+').map((p) => p.trim());
  const key = parts.filter((p) => !(MODIFIER_ORDER as readonly string[]).includes(p)).join('+');
  const mods = MODIFIER_ORDER.filter((m) => parts.includes(m));
  return [...mods, key].join('+');
}

/**
 * The pressed key as written in a combo. Digits go by physical key, because
 * Alt and Shift change the character they type; everything else goes by the
 * character the keyboard layout produces, so Ctrl+W is "the W key" on AZERTY
 * and Dvorak too.
 */
function keyName(event: KeyboardEvent): string {
  if (event.code.startsWith('Digit')) return event.code.slice(5);
  return event.key.toLowerCase();
}

function onKeyDown(event: KeyboardEvent): void {
  const mods = [event.ctrlKey && 'ctrl', event.altKey && 'alt', event.shiftKey && 'shift'].filter(Boolean);
  const matched = handlers.get([...mods, keyName(event)].join('+'));
  if (!matched || matched.size === 0) return;
  event.preventDefault();
  event.stopPropagation();
  // A held-down key keeps the default suppressed but acts only once.
  if (event.repeat) return;
  for (const handler of [...matched]) handler();
}

/**
 * Register a global shortcut such as `'alt+1'`, `'ctrl+s'` or `'alt+f12'`.
 * Returns a function that unregisters it.
 */
export function registerShortcut(combo: string, handler: Handler): () => void {
  const key = normalize(combo);
  let set = handlers.get(key);
  if (!set) {
    set = new Set();
    handlers.set(key, set);
  }
  set.add(handler);
  if (!listening) {
    // Capture phase: shortcuts win over the editor's own key bindings.
    window.addEventListener('keydown', onKeyDown, true);
    listening = true;
  }
  return () => {
    handlers.get(key)?.delete(handler);
  };
}
