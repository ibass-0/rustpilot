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

/** A file operation failure with a `kind` callers can branch on. */
export class AppError extends Error {
  kind: ErrorKind;

  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
  }
}

/** Turn any thrown value into an `AppError`; unknown shapes become kind `io`. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === 'object' && err !== null) {
    const { kind, message } = err as { kind?: unknown; message?: unknown };
    if (typeof kind === 'string' && ERROR_KINDS.includes(kind) && typeof message === 'string') {
      return new AppError(kind as ErrorKind, message);
    }
  }
  return new AppError('io', String(err));
}

/** The last segment of a Windows or POSIX path. */
export function fileNameOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const cut = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  return cut === -1 ? trimmed : trimmed.slice(cut + 1);
}

/** Append segments to a path, using whichever separator the base path already uses. */
export function joinPath(base: string, ...segments: string[]): string {
  const separator = base.includes('\\') || !base.includes('/') ? '\\' : '/';
  return [base.replace(/[\\/]+$/, ''), ...segments].join(separator);
}
