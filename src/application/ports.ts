import type { DirEntry, FileContent, LineEnding } from '../domain/fs';
import type { DataNode, DataSourceConfig } from '../domain/dataSource';
import type { GitStatus } from '../domain/git';
import type { SqlResult } from '../domain/sql';
import type { ShellProfile, TerminalSize } from '../domain/terminal';
import type { AgentPort } from '../domain/agent';

/** File access. Every method rejects with an `AppError`. */
export interface FileSystemPort {
  listDir(path: string): Promise<DirEntry[]>;
  readTextFile(path: string): Promise<FileContent>;
  writeTextFile(path: string, text: string, lineEnding: LineEnding): Promise<void>;
}

export interface DialogPort {
  /** Resolves to `null` when the picker is cancelled. */
  pickFolder(): Promise<string | null>;
  /** Resolves to `null` when the picker is cancelled. */
  pickFile(filters: { name: string; extensions: string[] }[]): Promise<string | null>;
  /** Resolves to `true` when the user accepts. */
  confirm(message: string): Promise<boolean>;
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

/** Read-only repository information. Mutating Git operations are added by later phases. */
export interface GitPort {
  repositories(root: string): Promise<string[]>;
  status(root: string): Promise<GitStatus>;
  diff(root: string, path: string, staged: boolean): Promise<string>;
  stage(root: string, paths: string[]): Promise<GitStatus>;
  unstage(root: string, paths: string[]): Promise<GitStatus>;
}

/** Live data source connections on the backend. Every method rejects with an `AppError`. */
export interface DataSourcePort {
  test(config: DataSourceConfig): Promise<void>;
  /** Connects, replacing any connection already open under the same id. */
  connect(config: DataSourceConfig): Promise<void>;
  disconnect(id: string): Promise<void>;
  /** The tree nodes under `path`; the empty path is the connection root. */
  children(id: string, path: string[]): Promise<DataNode[]>;
  /** The `.sql` console file of the connection, created empty on first use. */
  consolePath(id: string): Promise<string>;
  /** `executionId` is chosen by the caller and names the run for `cancel`. */
  execute(id: string, executionId: number, sql: string): Promise<SqlResult>;
  cancel(executionId: number): Promise<void>;
}

/** Holds the editable document behind each open tab. */
export interface BufferPort {
  open(path: string, text: string): void;
  has(path: string): boolean;
  /** The document text with `\n` line breaks. */
  text(path: string): string;
  /** The main selection as document offsets (equal when it is just a cursor), or `null` when the buffer is not open. */
  selection(path: string): { from: number; to: number } | null;
  /** Tell the editor which tables and columns exist, for completion in a SQL buffer. Keys may be `schema.table`. */
  setSqlSchema(path: string, schema: Record<string, string[]>): void;
  /** Add `text` on a new line at the end of the document and put the cursor after it. */
  append(path: string, text: string): void;
  close(path: string): void;
}

/** Shells running in pseudo terminals on the backend. Every method rejects with an `AppError`. */
export interface PtyPort {
  listShells(): Promise<ShellProfile[]>;
  /**
   * Start a shell. `id` is chosen by the caller and names the session from then
   * on. `cwd` of `null` lets the backend pick the home folder.
   */
  open(
    id: number,
    profileId: string,
    cwd: string | null,
    size: TerminalSize,
    onOutput: (data: string, seq: number) => void,
    onExit: (code: number) => void,
  ): Promise<void>;
  write(id: number, data: string): Promise<void>;
  resize(id: number, size: TerminalSize): Promise<void>;
  /**
   * Report that the screen has drawn every output chunk up to `seq`. The
   * backend holds output back while too many chunks are unacknowledged.
   */
  acknowledge(id: number, seq: number): Promise<void>;
  close(id: number): Promise<void>;
}

export interface TerminalScreenHandlers {
  /** Keys typed by the user, and replies the screen sends to the shell's queries. */
  onInput(data: string): void;
  onResize(size: TerminalSize): void;
}

/** The emulator screens that draw terminal output. */
export interface TerminalScreenPort {
  create(id: number, handlers: TerminalScreenHandlers): void;
  /** Draw `data`. `onProcessed` runs once the screen has actually handled it. */
  write(id: number, data: string, onProcessed?: () => void): void;
  dispose(id: number): void;
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
  git: GitPort;
  dataSource: DataSourcePort;
  pty: PtyPort;
  screens: TerminalScreenPort;
  agent?: AgentPort;
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
