import { invoke } from '@tauri-apps/api/core';
import { toIpcError, type DirEntry, type FileContent, type LineEnding } from './types';

async function call<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throw toIpcError(err);
  }
}

export function listDir(path: string): Promise<DirEntry[]> {
  return call('list_dir', { path });
}

export function readTextFile(path: string): Promise<FileContent> {
  return call('read_text_file', { path });
}

export async function writeTextFile(path: string, text: string, lineEnding: LineEnding): Promise<void> {
  await call<null>('write_text_file', { path, text, lineEnding });
}
