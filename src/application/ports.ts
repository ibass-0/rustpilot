import type { DirEntry, FileContent, LineEnding } from '../domain/fs';
import type { DataNode, DataSourceConfig, EngineKind } from '../domain/dataSource';
import type { FileVersions, GitStatus, RepositoryInfo } from '../domain/git';
import type { SqlResult } from '../domain/sql';
import type { ShellProfile, TerminalSize } from '../domain/terminal';
import type { AgentPort } from '../domain/agent';
import type { SshProfile, SshOutput } from '../domain/ssh';
import type { DockerPort } from '../domain/docker';

export interface SshPort {
  connect(sessionId: string, profile: SshProfile, onOutput: (output: SshOutput) => void, onExit: (code: number) => void): Promise<void>;
  write(sessionId: string, data: string): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  disconnect(sessionId: string): Promise<void>;
}

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
  /** Every repository at or below `root`, plus the one that contains `root` when it is not one itself. */
  repositories(root: string): Promise<RepositoryInfo[]>;
  /** The installed version. Rejects with `gitMissing` or `gitTooOld` when Git cannot be used. */
  version(): Promise<string>;
  /** Call `onChange` (debounced) whenever HEAD, the index or the refs of the repository at `root` change. */
  watch(root: string, onChange: () => void): Promise<void>;
  unwatch(root: string): Promise<void>;
  status(root: string): Promise<GitStatus>;
  diff(root: string, path: string, staged: boolean): Promise<string>;
  stage(root: string, paths: string[]): Promise<GitStatus>;
  unstage(root: string, paths: string[]): Promise<GitStatus>;
  /** Commit what is staged; gives the status afterwards. `amend` rewrites the last commit. */
  commit(root: string, message: string, amend: boolean, signOff: boolean): Promise<GitStatus>;
  /** The message of the last commit, or `null` when there is none. */
  lastMessage(root: string): Promise<string | null>;
  /** Restore `tracked` files from the index and delete `untracked` ones. This cannot be undone. */
  discard(root: string, tracked: string[], untracked: string[]): Promise<GitStatus>;
  /** Apply one hunk, as a patch with its file header, to the index or the working file. */
  applyHunk(root: string, patch: string, action: 'stage' | 'unstage' | 'discard'): Promise<GitStatus>;
  /** The two sides of a file as text for a side-by-side view. Rejects for binary files. */
  fileVersions(root: string, path: string, staged: boolean): Promise<FileVersions>;
  stageAll(root: string): Promise<GitStatus>;
  unstageAll(root: string): Promise<GitStatus>;
  blame?(root: string, path: string): Promise<GitBlameLine[]>;
}

export interface GitBlameLine {
  line: number;
  hash: string;
  author: string;
  summary: string;
}

/** Live data source connections on the backend. Every method rejects with an `AppError`. */
export interface DataSourcePort {
  /**
   * Try a connection without keeping it. `password` is what the user typed; when it is left out and
   * the config saves its password, the backend reads it from the Credential Manager.
   */
  test(config: DataSourceConfig, password?: string): Promise<void>;
  /** Connects, replacing any connection already open under the same id. Passwords follow the rule of `test`. */
  connect(config: DataSourceConfig, password?: string): Promise<void>;
  /** Keep a password in the Credential Manager. It never comes back to the frontend. */
  saveSecret(id: string, password: string): Promise<void>;
  /** Remove a saved password. Removing one that is not there succeeds. */
  forgetSecret(id: string): Promise<void>;
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
  setSqlSchema(path: string, schema: Record<string, string[]>, engine: EngineKind): void;
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
  ssh?: SshPort;
  docker?: DockerPort;
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
