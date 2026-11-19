import { ask, message, open } from '@tauri-apps/plugin-dialog';

/** Folder picker. Resolves to `null` when cancelled. */
export async function pickFolder(): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false, title: 'Open Folder' });
  return typeof picked === 'string' ? picked : null;
}

/** Resolves to `true` when the user agrees to discard unsaved changes. */
export function confirmDiscard(fileName: string): Promise<boolean> {
  return ask(`${fileName} has unsaved changes. Discard them?`, {
    title: 'Unsaved changes',
    kind: 'warning',
    okLabel: 'Discard',
    cancelLabel: 'Cancel',
  });
}

export async function showError(text: string): Promise<void> {
  await message(text, { title: 'RustPilot', kind: 'error' });
}
