import { beforeEach, expect, test, vi } from 'vitest';
import {
  activateTab,
  closeTab,
  confirmWindowClose,
  editor,
  hasDirtyTabs,
  markDirty,
  openFile,
  saveTab,
  setCursor,
} from '../../src/application/editorStore';
import { AppError } from '../../src/domain/fs';
import { installFakePorts } from '../helpers/ports';

const A = 'C:\\p\\a.ts';
const B = 'C:\\p\\b.ts';
const C = 'C:\\p\\c.ts';

let fakes: ReturnType<typeof installFakePorts>;

beforeEach(async () => {
  // Close whatever the previous test left open, answering "discard" to any prompt.
  installFakePorts();
  for (const tab of [...editor.tabs]) await closeTab(tab.path);
  fakes = installFakePorts();
});

test('openFile adds a tab, activates it, keeps line ending', async () => {
  fakes.fs.readTextFile.mockResolvedValue({ text: 'x\r\ny', lineEnding: 'crlf' });
  await openFile(A);
  expect(editor.tabs).toEqual([{ path: A, name: 'a.ts', lineEnding: 'crlf', dirty: false }]);
  expect(editor.activePath).toBe(A);
  expect(fakes.buffers.text(A)).toBe('x\ny');
});

test('openFile twice does not duplicate or re-read', async () => {
  await openFile(A);
  await openFile(B);
  await openFile(A);
  expect(editor.tabs.map((t) => t.path)).toEqual([A, B]);
  expect(editor.activePath).toBe(A);
  expect(fakes.fs.readTextFile).toHaveBeenCalledTimes(2);
});

test('opening the same file twice at once yields one tab', async () => {
  await Promise.all([openFile(A), openFile(A)]);
  expect(editor.tabs.map((t) => t.path)).toEqual([A]);
});

test('openFile on non-UTF-8 shows message and adds no tab', async () => {
  fakes.fs.readTextFile.mockRejectedValue(new AppError('notUtf8', 'x'));
  await openFile('C:\\p\\img.png');
  expect(editor.tabs).toEqual([]);
  expect(fakes.dialog.showError).toHaveBeenCalledWith('img.png is not a UTF-8 text file and cannot be displayed.');
});

test('openFile on too-large file shows size message', async () => {
  fakes.fs.readTextFile.mockRejectedValue(new AppError('tooLarge', 'x'));
  await openFile('C:\\p\\big.log');
  expect(editor.tabs).toEqual([]);
  expect(fakes.dialog.showError).toHaveBeenCalledWith('big.log is larger than 10 MB.');
});

test('openFile on any other failure shows the backend message', async () => {
  fakes.fs.readTextFile.mockRejectedValue(new AppError('permissionDenied', 'access denied'));
  await openFile(A);
  expect(editor.tabs).toEqual([]);
  expect(fakes.dialog.showError).toHaveBeenCalledWith('access denied');
});

test('saveTab writes buffer with tab line ending and clears dirty', async () => {
  fakes.fs.readTextFile.mockResolvedValue({ text: 'x\r\ny', lineEnding: 'crlf' });
  await openFile(A);
  markDirty(A);
  expect(await saveTab(A)).toBe(true);
  expect(fakes.fs.writeTextFile).toHaveBeenCalledWith(A, 'x\ny', 'crlf');
  expect(editor.tabs[0].dirty).toBe(false);
});

test('saveTab failure keeps dirty and buffer, shows error', async () => {
  await openFile(A);
  markDirty(A);
  fakes.fs.writeTextFile.mockRejectedValue(new AppError('permissionDenied', 'file is locked'));
  expect(await saveTab(A)).toBe(false);
  expect(editor.tabs[0].dirty).toBe(true);
  expect(fakes.buffers.has(A)).toBe(true);
  expect(fakes.dialog.showError).toHaveBeenCalledWith('file is locked');
});

test('saveTab keeps dirty when the buffer changed while the write was in flight', async () => {
  fakes.fs.readTextFile.mockResolvedValue({ text: 'one', lineEnding: 'lf' });
  await openFile(A);
  markDirty(A);
  fakes.fs.writeTextFile.mockImplementation(async () => {
    fakes.buffers.open(A, 'one, then typed more');
  });
  expect(await saveTab(A)).toBe(true);
  expect(editor.tabs[0].dirty).toBe(true);
});

test('saveTab on a clean tab does not touch the file', async () => {
  await openFile(A);
  expect(await saveTab(A)).toBe(true);
  expect(fakes.fs.writeTextFile).not.toHaveBeenCalled();
});

test('overlapping saves run one after another and end clean', async () => {
  fakes.fs.readTextFile.mockResolvedValue({ text: 'one', lineEnding: 'lf' });
  await openFile(A);
  markDirty(A);

  const finishWrite: Array<() => void> = [];
  fakes.fs.writeTextFile.mockImplementation(() => new Promise<void>((resolve) => finishWrite.push(resolve)));

  const first = saveTab(A);
  await vi.waitFor(() => expect(fakes.fs.writeTextFile).toHaveBeenCalledTimes(1));
  // The user keeps typing and saves again while the first write is still in flight.
  fakes.buffers.open(A, 'two');
  const second = saveTab(A);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fakes.fs.writeTextFile).toHaveBeenCalledTimes(1);

  finishWrite[0]();
  expect(await first).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fakes.fs.writeTextFile).toHaveBeenCalledTimes(2);
  finishWrite[1]();
  expect(await second).toBe(true);

  expect(fakes.fs.writeTextFile.mock.calls.map((call) => call[1])).toEqual(['one', 'two']);
  expect(editor.tabs[0].dirty).toBe(false);
});

test('saveTab on an unknown path does nothing', async () => {
  expect(await saveTab(A)).toBe(false);
  expect(fakes.fs.writeTextFile).not.toHaveBeenCalled();
});

test('closeTab on clean tab closes without asking', async () => {
  await openFile(A);
  expect(await closeTab(A)).toBe(true);
  expect(fakes.dialog.confirmDiscard).not.toHaveBeenCalled();
  expect(editor.tabs).toEqual([]);
  expect(editor.activePath).toBeNull();
  expect(fakes.buffers.has(A)).toBe(false);
});

test('closeTab on dirty tab, user cancels: nothing changes', async () => {
  await openFile(A);
  markDirty(A);
  fakes.dialog.confirmDiscard.mockResolvedValue(false);
  expect(await closeTab(A)).toBe(false);
  expect(editor.tabs).toHaveLength(1);
  expect(editor.tabs[0].dirty).toBe(true);
  expect(fakes.buffers.has(A)).toBe(true);
});

test('closeTab on dirty tab, user confirms: tab closes', async () => {
  await openFile(A);
  markDirty(A);
  fakes.dialog.confirmDiscard.mockResolvedValue(true);
  expect(await closeTab(A)).toBe(true);
  expect(fakes.dialog.confirmDiscard).toHaveBeenCalledWith('a.ts');
  expect(editor.tabs).toEqual([]);
});

test('closing active tab activates right neighbour, else left', async () => {
  await openFile(A);
  await openFile(B);
  await openFile(C);
  activateTab(B);
  await closeTab(B);
  expect(editor.activePath).toBe(C);
  await closeTab(C);
  expect(editor.activePath).toBe(A);
});

test('closing an inactive tab keeps the active one', async () => {
  await openFile(A);
  await openFile(B);
  await closeTab(A);
  expect(editor.activePath).toBe(B);
});

test('hasDirtyTabs reflects dirty state', async () => {
  await openFile(A);
  expect(hasDirtyTabs()).toBe(false);
  markDirty(A);
  expect(hasDirtyTabs()).toBe(true);
});

test('setCursor updates the cursor position', () => {
  setCursor(12, 4);
  expect(editor.cursor).toEqual({ line: 12, col: 4 });
});

test('confirmWindowClose allows closing without asking when nothing is dirty', async () => {
  await openFile(A);
  expect(await confirmWindowClose()).toBe(true);
  expect(fakes.dialog.confirmDiscard).not.toHaveBeenCalled();
});

test('confirmWindowClose asks when a tab is dirty and honours the answer', async () => {
  await openFile(A);
  markDirty(A);
  fakes.dialog.confirmDiscard.mockResolvedValue(false);
  expect(await confirmWindowClose()).toBe(false);
  fakes.dialog.confirmDiscard.mockResolvedValue(true);
  expect(await confirmWindowClose()).toBe(true);
  expect(fakes.dialog.confirmDiscard).toHaveBeenCalledWith('a.ts');
});
