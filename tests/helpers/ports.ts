import { vi } from 'vitest';
import {
  configurePorts,
  type BufferPort,
  type StoragePort,
  type TerminalScreenHandlers,
} from '../../src/application/ports';
import type { ShellProfile, TerminalSize } from '../../src/domain/terminal';
import { emptyGitStatus } from '../../src/domain/git';
import type { SqlResult } from '../../src/domain/sql';

export function emptySqlResult(patch: Partial<SqlResult> = {}): SqlResult {
  return { columns: [], rows: [], truncated: false, rowsAffected: null, elapsedMs: 0, ...patch };
}

/** An in-memory `BufferPort` that normalises line breaks the way the editor does. */
function memoryBuffers(): BufferPort & { selections: Map<string, { from: number; to: number }> } {
  const docs = new Map<string, string>();
  const selections = new Map<string, { from: number; to: number }>();
  return {
    selections,
    selection: (path) => (docs.has(path) ? (selections.get(path) ?? { from: 0, to: 0 }) : null),
    setSqlSchema: () => {},
    append: (path, text) => {
      const doc = docs.get(path) ?? '';
      docs.set(path, `${doc}${doc === '' || doc.endsWith('\n') ? '' : '\n'}${text}\n`);
    },
    open: (path, text) => void docs.set(path, text.replace(/\r\n/g, '\n')),
    has: (path) => docs.has(path),
    text: (path) => docs.get(path) ?? '',
    close: (path) => void docs.delete(path),
  };
}

function memoryStorage(): StoragePort {
  const values = new Map<string, string>();
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  };
}

export const FAKE_SHELLS: ShellProfile[] = [
  { id: 'pwsh', name: 'PowerShell', program: 'C:\\pwsh.exe', args: ['-NoLogo'] },
  { id: 'cmd', name: 'Command Prompt', program: 'C:\\cmd.exe', args: [] },
  { id: 'git-bash', name: 'Git Bash', program: 'C:\\Git\\bin\\bash.exe', args: ['--login', '-i'] },
];

/** Configure the application with fresh fakes and return them for assertions. */
export function installFakePorts() {
  const sessions = new Map<number, { onOutput: (data: string, seq: number) => void; onExit: (code: number) => void }>();
  const screenHandlers = new Map<number, TerminalScreenHandlers>();
  const gitWatchers = new Map<string, () => void>();

  const fakes = {
    fs: {
      listDir: vi.fn().mockResolvedValue([]),
      readTextFile: vi.fn().mockResolvedValue({ text: '', lineEnding: 'lf' }),
      writeTextFile: vi.fn().mockResolvedValue(undefined),
    },
    dialog: {
      pickFolder: vi.fn().mockResolvedValue(null),
      pickFile: vi.fn().mockResolvedValue(null),
      confirm: vi.fn().mockResolvedValue(true),
      confirmDiscard: vi.fn().mockResolvedValue(true),
      showError: vi.fn().mockResolvedValue(undefined),
    },
    storage: memoryStorage(),
    buffers: memoryBuffers(),
    git: {
      repositories: vi.fn().mockResolvedValue([]),
      version: vi.fn().mockResolvedValue('git version 2.47.1.windows.1'),
      watch: vi.fn(async (root: string, onChange: () => void): Promise<void> => void gitWatchers.set(root, onChange)),
      unwatch: vi.fn(async (root: string): Promise<void> => void gitWatchers.delete(root)),
      status: vi.fn().mockResolvedValue(emptyGitStatus()),
      diff: vi.fn().mockResolvedValue(''),
      stage: vi.fn().mockResolvedValue(emptyGitStatus()),
      unstage: vi.fn().mockResolvedValue(emptyGitStatus()),
      commit: vi.fn().mockResolvedValue(emptyGitStatus()),
      lastMessage: vi.fn().mockResolvedValue(null),
      discard: vi.fn().mockResolvedValue(emptyGitStatus()),
      stageAll: vi.fn().mockResolvedValue(emptyGitStatus()),
      unstageAll: vi.fn().mockResolvedValue(emptyGitStatus()),
    },
    dataSource: {
      test: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      saveSecret: vi.fn().mockResolvedValue(undefined),
      forgetSecret: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      children: vi.fn().mockResolvedValue([]),
      consolePath: vi.fn().mockResolvedValue('C:\\data\\consoles\\a1.sql'),
      execute: vi.fn().mockResolvedValue(emptySqlResult()),
      cancel: vi.fn().mockResolvedValue(undefined),
    },
    pty: {
      listShells: vi.fn().mockResolvedValue(FAKE_SHELLS),
      open: vi.fn(
        async (
          id: number,
          _profileId: string,
          _cwd: string | null,
          _size: TerminalSize,
          onOutput: (data: string, seq: number) => void,
          onExit: (code: number) => void,
        ): Promise<void> => {
          sessions.set(id, { onOutput, onExit });
        },
      ),
      write: vi.fn().mockResolvedValue(undefined),
      resize: vi.fn().mockResolvedValue(undefined),
      acknowledge: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    },
    screens: {
      create: vi.fn((id: number, handlers: TerminalScreenHandlers) => void screenHandlers.set(id, handlers)),
      // By default the screen processes output at once.
      write: vi.fn((_id: number, _data: string, done?: () => void) => done?.()),
      dispose: vi.fn(),
    },
    /** Simulate Git changing on disk: fires the watcher registered for `root`. */
    gitEvents: {
      emit: (root: string) => gitWatchers.get(root)?.(),
      watching: () => [...gitWatchers.keys()],
    },
    /** Drive a fake terminal from either end. */
    terminal: {
      /** For tests that replace `pty.open` but still want to emit shell events. */
      register: (id: number, onOutput: (data: string, seq: number) => void, onExit: (code: number) => void) =>
        void sessions.set(id, { onOutput, onExit }),
      emitOutput: (id: number, data: string, seq = 1) => sessions.get(id)?.onOutput(data, seq),
      emitExit: (id: number, code: number) => sessions.get(id)?.onExit(code),
      type: (id: number, data: string) => screenHandlers.get(id)?.onInput(data),
      resizeScreen: (id: number, size: TerminalSize) => screenHandlers.get(id)?.onResize(size),
    },
  };
  configurePorts(fakes);
  return fakes;
}
