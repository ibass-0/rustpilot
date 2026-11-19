import { getCurrentWindow } from '@tauri-apps/api/window';
import type { WindowControls } from '../../application/ports';

/** Ask `mayClose` whenever the user tries to close the window; the window stays open unless it resolves to `true`. */
export function guardWindowClose(mayClose: () => Promise<boolean>): void {
  void getCurrentWindow().onCloseRequested(async (event) => {
    if (!(await mayClose())) event.preventDefault();
  });
}

/** Native window buttons for the custom title bar. `close` goes through the close guard above. */
export const tauriWindowControls: WindowControls = {
  minimize: () => void getCurrentWindow().minimize(),
  toggleMaximize: () => void getCurrentWindow().toggleMaximize(),
  close: () => void getCurrentWindow().close(),
  isMaximized: () => getCurrentWindow().isMaximized(),
  onResized: (listener) => void getCurrentWindow().onResized(listener),
};
