export type LineEnding = 'lf' | 'crlf';

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface FileContent {
  text: string;
  lineEnding: LineEnding;
}

export type ErrorKind = 'notFound' | 'permissionDenied' | 'notUtf8' | 'tooLarge' | 'io';

const ERROR_KINDS: readonly string[] = ['notFound', 'permissionDenied', 'notUtf8', 'tooLarge', 'io'];

/** A backend error with a `kind` callers can branch on. */
export class IpcError extends Error {
  kind: ErrorKind;

  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.name = 'IpcError';
    this.kind = kind;
  }
}

/** Turn any `invoke` rejection into an `IpcError`. */
export function toIpcError(err: unknown): IpcError {
  if (err instanceof IpcError) return err;
  if (typeof err === 'object' && err !== null) {
    const { kind, message } = err as { kind?: unknown; message?: unknown };
    if (typeof kind === 'string' && ERROR_KINDS.includes(kind) && typeof message === 'string') {
      return new IpcError(kind as ErrorKind, message);
    }
  }
  return new IpcError('io', String(err));
}
