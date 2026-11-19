import { invoke } from '@tauri-apps/api/core';
import type { FileSystemPort } from '../../application/ports';
import { toAppError } from '../../domain/fs';

async function call<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throw toAppError(err);
  }
}

/** `FileSystemPort` backed by the Rust commands. */
export const tauriFileSystem: FileSystemPort = {
  listDir: (path) => call('list_dir', { path }),
  readTextFile: (path) => call('read_text_file', { path }),
  writeTextFile: async (path, text, lineEnding) => {
    await call<null>('write_text_file', { path, text, lineEnding });
  },
};
