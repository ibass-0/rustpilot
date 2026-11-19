import type { ITheme } from '@xterm/xterm';

const cssVar = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** The code font, as the app's stylesheet defines it. */
export function terminalFont(): string {
  return cssVar('--font-mono', 'Consolas, monospace');
}

/** Terminal colours: surfaces from the app theme, ANSI colours tuned for the dark island. */
export function terminalTheme(): ITheme {
  return {
    background: cssVar('--bg-island', '#1b1c20'),
    foreground: '#c9ccd3',
    cursor: '#d7dae0',
    cursorAccent: cssVar('--bg-island', '#1b1c20'),
    selectionBackground: '#2f4b7a',
    black: '#1b1c20',
    red: '#e5646a',
    green: '#5fb878',
    yellow: '#d9a443',
    blue: '#4d9ef0',
    magenta: '#b07cf0',
    cyan: '#4fc1c9',
    white: '#c9ccd3',
    brightBlack: '#6c717c',
    brightRed: '#f08a8f',
    brightGreen: '#84d29a',
    brightYellow: '#e9c46a',
    brightBlue: '#7bb8f7',
    brightMagenta: '#c9a3f7',
    brightCyan: '#7dd6dc',
    brightWhite: '#f1f3f6',
  };
}
