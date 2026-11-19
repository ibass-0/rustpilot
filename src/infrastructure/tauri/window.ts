import { getCurrentWindow } from '@tauri-apps/api/window';

/** Ask `mayClose` whenever the user tries to close the window; the window stays open unless it resolves to `true`. */
export function guardWindowClose(mayClose: () => Promise<boolean>): void {
  void getCurrentWindow().onCloseRequested(async (event) => {
    if (!(await mayClose())) event.preventDefault();
  });
}
