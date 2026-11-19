import { registerShortcut } from './shortcuts';

const RELOAD_COMBOS = ['f5', 'ctrl+f5', 'ctrl+r', 'ctrl+shift+r'];

/**
 * Reloading the webview would throw away every open tab and unsaved edit
 * without asking, so the ways to trigger it are switched off: the reload keys,
 * and the browser context menu (which offers "Refresh") outside the editor.
 */
export function installReloadGuard(): void {
  for (const combo of RELOAD_COMBOS) registerShortcut(combo, () => {});

  window.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('.cm-editor')) return;
    event.preventDefault();
  });
}
