import { expect, test } from 'vitest';
import { exitNotice, INITIAL_TERMINAL_SIZE, neighbourAfterClose, tabTitle } from '../../src/domain/terminal';

test('the first terminal of a shell is named after it', () => {
  expect(tabTitle('PowerShell', [])).toBe('PowerShell');
  expect(tabTitle('PowerShell', ['Command Prompt'])).toBe('PowerShell');
});

test('repeated shells are numbered', () => {
  expect(tabTitle('PowerShell', ['PowerShell'])).toBe('PowerShell (2)');
  expect(tabTitle('PowerShell', ['PowerShell', 'PowerShell (2)'])).toBe('PowerShell (3)');
});

test('a number freed by a closed terminal is reused', () => {
  expect(tabTitle('PowerShell', ['PowerShell (2)'])).toBe('PowerShell');
  expect(tabTitle('PowerShell', ['PowerShell', 'PowerShell (3)'])).toBe('PowerShell (2)');
});

test('exitNotice names the exit code on its own dimmed line', () => {
  const notice = exitNotice(3);
  expect(notice).toContain('[Process exited with code 3]');
  expect(notice.startsWith('\r\n')).toBe(true);
  expect(notice).toContain('\x1b[90m');
  expect(notice).toContain('\x1b[0m');
});

test('terminals start at 80 by 24', () => {
  expect(INITIAL_TERMINAL_SIZE).toEqual({ cols: 80, rows: 24 });
});

test('closing the active terminal activates the right neighbour, else the left one', () => {
  expect(neighbourAfterClose([1, 2, 3], 2, 2)).toBe(3);
  expect(neighbourAfterClose([1, 2, 3], 3, 3)).toBe(2);
  expect(neighbourAfterClose([1], 1, 1)).toBeNull();
});

test('closing an inactive terminal keeps the active one', () => {
  expect(neighbourAfterClose([1, 2, 3], 1, 3)).toBe(3);
});
