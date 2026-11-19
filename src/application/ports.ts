import type { DirEntry, FileContent, LineEnding } from '../domain/fs';

/** File access. Every method rejects with an `AppError`. */
export interface FileSystemPort {
  listDir(path: string): Promise<DirEntry[]>;
  readTextFile(path: string): Promise<FileContent>;
  writeTextFile(path: string, text: string, lineEnding: LineEnding): Promise<void>;
}

export interface DialogPort {
  /** Resolves to `null` when the picker is cancelled. */
  pickFolder(): Promise<string | null>;
  /** Resolves to `true` when the user agrees to discard unsaved changes. */
  confirmDiscard(fileName: string): Promise<boolean>;
  showError(message: string): Promise<void>;
}

/** Small synchronous key-value persistence. Never throws. */
export interface StoragePort {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Holds the editable document behind each open tab. */
export interface BufferPort {
  open(path: string, text: string): void;
  has(path: string): boolean;
  /** The document text with `\n` line breaks. */
  text(path: string): string;
  close(path: string): void;
}

/** Native window buttons, used by the custom title bar. Passed to the UI directly rather than through `ports()`. */
export interface WindowControls {
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;
  onResized(listener: () => void): void;
}

export interface Ports {
  fs: FileSystemPort;
  dialog: DialogPort;
  storage: StoragePort;
  buffers: BufferPort;
}

let current: Ports | null = null;

/** Wire the adapters. Called once from the composition root (`src/index.tsx`) and from tests. */
export function configurePorts(ports: Ports): void {
  current = ports;
}

export function ports(): Ports {
  if (!current) throw new Error('Ports are not configured; call configurePorts() first.');
  return current;
}
