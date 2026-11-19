/** A shell the user can start a terminal with. */
export interface ShellProfile {
  id: string;
  name: string;
  program: string;
  args: string[];
}

export interface TerminalTab {
  id: number;
  title: string;
  profileId: string;
  /** True once the shell has ended; the tab stays until the user closes it. */
  exited: boolean;
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

/** The size every terminal starts at, before its panel has been measured. */
export const INITIAL_TERMINAL_SIZE: TerminalSize = { cols: 80, rows: 24 };

/** A title for a new tab: the shell's name, numbered when that name is already taken. */
export function tabTitle(profileName: string, existing: readonly string[]): string {
  if (!existing.includes(profileName)) return profileName;
  for (let number = 2; ; number++) {
    const candidate = `${profileName} (${number})`;
    if (!existing.includes(candidate)) return candidate;
  }
}

/** The dimmed line written to a terminal when its shell ends. */
export function exitNotice(code: number): string {
  return `\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`;
}

/**
 * Which tab becomes active once `closing` is removed: unchanged if another tab
 * was active, otherwise the right neighbour, then the left one, then none.
 */
export function neighbourAfterClose(ids: readonly number[], closing: number, active: number | null): number | null {
  if (active !== closing) return active;
  const index = ids.indexOf(closing);
  if (index === -1) return active;
  return ids[index + 1] ?? ids[index - 1] ?? null;
}
