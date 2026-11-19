import { beforeEach, expect, test } from 'vitest';
import {
  closeWorkspace,
  openWorkspace,
  pickAndOpenWorkspace,
  refreshDir,
  refreshWorkspace,
  restoreWorkspace,
  toggleDir,
  workspace,
} from '../../src/application/workspaceStore';
import { AppError } from '../../src/domain/fs';
import { installFakePorts } from '../helpers/ports';

const KEY = 'rustpilot.workspace.v1';
let fakes: ReturnType<typeof installFakePorts>;

beforeEach(() => {
  fakes = installFakePorts();
  closeWorkspace();
});

test('openWorkspace loads root children and persists path', async () => {
  fakes.fs.listDir.mockResolvedValue([{ name: 'src', path: 'C:\\p\\src', isDir: true }]);
  await openWorkspace('C:\\p');
  expect(workspace.root).toBe('C:\\p');
  expect(workspace.children['C:\\p']).toHaveLength(1);
  expect(fakes.storage.get(KEY)).toBe('C:\\p');
});

test('toggleDir re-reads the directory every time it is expanded, not when collapsed', async () => {
  await openWorkspace('C:\\p');
  fakes.fs.listDir.mockClear();
  fakes.fs.listDir.mockResolvedValue([{ name: 'a.ts', path: 'C:\\p\\src\\a.ts', isDir: false }]);
  await toggleDir('C:\\p\\src');
  await toggleDir('C:\\p\\src');
  expect(fakes.fs.listDir).toHaveBeenCalledTimes(1);

  // A file created outside the app shows up on the next expand.
  fakes.fs.listDir.mockResolvedValue([
    { name: 'a.ts', path: 'C:\\p\\src\\a.ts', isDir: false },
    { name: 'b.ts', path: 'C:\\p\\src\\b.ts', isDir: false },
  ]);
  await toggleDir('C:\\p\\src');
  expect(fakes.fs.listDir).toHaveBeenCalledTimes(2);
  expect(workspace.expanded['C:\\p\\src']).toBe(true);
  expect(workspace.children['C:\\p\\src'].map((e) => e.name)).toEqual(['a.ts', 'b.ts']);
});

test('refreshWorkspace re-reads the root and every expanded directory', async () => {
  await openWorkspace('C:\\p');
  await toggleDir('C:\\p\\src');
  await toggleDir('C:\\p\\closed');
  await toggleDir('C:\\p\\closed');
  fakes.fs.listDir.mockClear();
  fakes.fs.listDir.mockImplementation(async (path: string) => [{ name: 'fresh.ts', path: `${path}\\fresh.ts`, isDir: false }]);

  await refreshWorkspace();

  expect(fakes.fs.listDir.mock.calls.map((call) => call[0]).sort()).toEqual(['C:\\p', 'C:\\p\\src']);
  expect(workspace.children['C:\\p'][0].name).toBe('fresh.ts');
  expect(workspace.children['C:\\p\\src'][0].name).toBe('fresh.ts');
});

test('refreshWorkspace collapses a directory that vanished, without an error dialog', async () => {
  await openWorkspace('C:\\p');
  await toggleDir('C:\\p\\src');
  fakes.fs.listDir.mockImplementation(async (path: string) => {
    if (path === 'C:\\p\\src') throw new AppError('notFound', 'missing');
    return [];
  });

  await refreshWorkspace();

  expect(workspace.expanded['C:\\p\\src']).toBeFalsy();
  expect(workspace.children['C:\\p\\src']).toBeUndefined();
  expect(fakes.dialog.showError).not.toHaveBeenCalled();
});

test('refreshWorkspace does nothing when no folder is open', async () => {
  await refreshWorkspace();
  expect(fakes.fs.listDir).not.toHaveBeenCalled();
});

test('a slow restore does not replace a folder picked in the meantime', async () => {
  fakes.storage.set(KEY, 'C:\\old');
  let finishRestore!: (entries: never[]) => void;
  fakes.fs.listDir.mockImplementationOnce(() => new Promise((resolve) => (finishRestore = resolve)));
  const restoring = restoreWorkspace();

  await openWorkspace('C:\\picked');
  finishRestore([]);
  await restoring;

  expect(workspace.root).toBe('C:\\picked');
  expect(fakes.storage.get(KEY)).toBe('C:\\picked');
});

test('toggleDir failure keeps dir collapsed and shows error', async () => {
  await openWorkspace('C:\\p');
  fakes.fs.listDir.mockRejectedValue(new AppError('permissionDenied', 'access denied'));
  await toggleDir('C:\\p\\secret');
  expect(workspace.expanded['C:\\p\\secret']).toBeFalsy();
  expect(fakes.dialog.showError).toHaveBeenCalledWith('access denied');
});

test('openWorkspace clears previous cache', async () => {
  await openWorkspace('C:\\p');
  await toggleDir('C:\\p\\src');
  await openWorkspace('C:\\q');
  expect(Object.keys(workspace.children)).toEqual(['C:\\q']);
  expect(workspace.expanded).toEqual({});
});

test('openWorkspace failure keeps the current workspace', async () => {
  await openWorkspace('C:\\p');
  fakes.fs.listDir.mockRejectedValue(new AppError('notFound', 'missing'));
  await expect(openWorkspace('C:\\gone')).rejects.toMatchObject({ kind: 'notFound' });
  expect(workspace.root).toBe('C:\\p');
  expect(fakes.storage.get(KEY)).toBe('C:\\p');
});

test('refreshDir replaces cached children', async () => {
  await openWorkspace('C:\\p');
  fakes.fs.listDir.mockResolvedValue([{ name: 'new.ts', path: 'C:\\p\\new.ts', isDir: false }]);
  await refreshDir('C:\\p');
  expect(workspace.children['C:\\p'].map((e) => e.name)).toEqual(['new.ts']);
});

test('restoreWorkspace reopens the last folder', async () => {
  fakes.storage.set(KEY, 'C:\\p');
  await restoreWorkspace();
  expect(workspace.root).toBe('C:\\p');
});

test('restoreWorkspace with missing folder resets to empty state', async () => {
  fakes.storage.set(KEY, 'C:\\gone');
  fakes.fs.listDir.mockRejectedValue(new AppError('notFound', 'missing'));
  await restoreWorkspace();
  expect(workspace.root).toBeNull();
  expect(fakes.storage.get(KEY)).toBeNull();
  expect(fakes.dialog.showError).not.toHaveBeenCalled();
});

test('pickAndOpenWorkspace does nothing when dialog is cancelled', async () => {
  fakes.dialog.pickFolder.mockResolvedValue(null);
  await pickAndOpenWorkspace();
  expect(workspace.root).toBeNull();
});

test('pickAndOpenWorkspace opens the picked folder', async () => {
  fakes.dialog.pickFolder.mockResolvedValue('C:\\p');
  await pickAndOpenWorkspace();
  expect(workspace.root).toBe('C:\\p');
});

test('pickAndOpenWorkspace shows an error when the folder cannot be read', async () => {
  fakes.dialog.pickFolder.mockResolvedValue('C:\\locked');
  fakes.fs.listDir.mockRejectedValue(new AppError('permissionDenied', 'access denied'));
  await pickAndOpenWorkspace();
  expect(workspace.root).toBeNull();
  expect(fakes.dialog.showError).toHaveBeenCalledWith('access denied');
});
