type Handler = () => void;

export interface ShortcutOptions {
  /**
   * CSS selector of an area where this shortcut does not apply at all. While
   * the key is pressed inside it, the key is left alone for that area to use
   * (the terminal needs Ctrl+W and Ctrl+S for the shell).
   */
  exceptIn?: string;
  /**
   * Stop the browser's own action for the key, but still let the key reach
   * the element that has focus.
   */
  passThrough?: boolean;
}

interface Registration {
  handler: Handler;
  options: ShortcutOptions;
}

const registrations = new Map<string, Set<Registration>>();
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

function appliesTo(registration: Registration, target: EventTarget | null): boolean {
  const { exceptIn } = registration.options;
  return !(exceptIn && target instanceof Element && target.closest(exceptIn));
}

function onKeyDown(event: KeyboardEvent): void {
  const mods = [event.ctrlKey && 'ctrl', event.altKey && 'alt', event.shiftKey && 'shift'].filter(Boolean);
  const registered = registrations.get([...mods, keyName(event)].join('+'));
  if (!registered) return;
  const matched = [...registered].filter((registration) => appliesTo(registration, event.target));
  if (matched.length === 0) return;

  event.preventDefault();
  if (!matched.every((registration) => registration.options.passThrough)) event.stopPropagation();
  // A held-down key keeps the default suppressed but acts only once.
  if (event.repeat) return;
  for (const registration of matched) registration.handler();
}

/**
 * Register a global shortcut such as `'alt+1'`, `'ctrl+s'` or `'alt+f12'`.
 * Returns a function that unregisters it.
 */
export function registerShortcut(combo: string, handler: Handler, options: ShortcutOptions = {}): () => void {
  const key = normalize(combo);
  let set = registrations.get(key);
  if (!set) {
    set = new Set();
    registrations.set(key, set);
  }
  const registration: Registration = { handler, options };
  set.add(registration);
  if (!listening) {
    // Capture phase: shortcuts win over the editor's own key bindings.
    window.addEventListener('keydown', onKeyDown, true);
    listening = true;
  }
  return () => {
    registrations.get(key)?.delete(registration);
  };
}
