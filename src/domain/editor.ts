import type { AppError, LineEnding } from './fs';

export interface Tab {
  path: string;
  name: string;
  lineEnding: LineEnding;
  /** True while the buffer has changes that are not on disk. */
  dirty: boolean;
}

export interface CursorPosition {
  line: number;
  col: number;
}

/**
 * Which tab becomes active once `closing` is removed: unchanged if another tab
 * was active, otherwise the right neighbour, then the left one, then none.
 */
export function nextActivePath(tabs: readonly Tab[], closing: string, active: string | null): string | null {
  if (active !== closing) return active;
  const index = tabs.findIndex((tab) => tab.path === closing);
  if (index === -1) return active;
  return tabs[index + 1]?.path ?? tabs[index - 1]?.path ?? null;
}

/** The message shown when a file cannot be opened in the editor. */
export function openErrorMessage(name: string, err: AppError): string {
  switch (err.kind) {
    case 'notUtf8':
      return `${name} is not a UTF-8 text file and cannot be displayed.`;
    case 'tooLarge':
      return `${name} is larger than 10 MB.`;
    default:
      return err.message;
  }
}
