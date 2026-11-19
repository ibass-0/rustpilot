import { ask, message, open } from '@tauri-apps/plugin-dialog';
import type { DialogPort } from '../../application/ports';

/** `DialogPort` backed by native OS dialogs. */
export const tauriDialog: DialogPort = {
  async pickFolder() {
    const picked = await open({ directory: true, multiple: false, title: 'Open Folder' });
    return typeof picked === 'string' ? picked : null;
  },

  confirmDiscard(fileName) {
    return ask(`${fileName} has unsaved changes. Discard them?`, {
      title: 'Unsaved changes',
      kind: 'warning',
      okLabel: 'Discard',
      cancelLabel: 'Cancel',
    });
  },

  async showError(text) {
    await message(text, { title: 'RustPilot', kind: 'error' });
  },
};
