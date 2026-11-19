import type { FileSystemPort } from '../../application/ports';
import { call } from './invoke';

/** `FileSystemPort` backed by the Rust commands. */
export const tauriFileSystem: FileSystemPort = {
  listDir: (path) => call('list_dir', { path }),
  readTextFile: (path) => call('read_text_file', { path }),
  writeTextFile: async (path, text, lineEnding) => {
    await call<null>('write_text_file', { path, text, lineEnding });
  },
};
