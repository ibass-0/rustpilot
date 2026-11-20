import { beforeEach, expect, test } from 'vitest';
import { git, resetGit } from '../../src/application/gitStore';
import {
  addFolderToWorkspace,
  closeWorkspace,
  collapseAll,
  openWorkspace,
  pickAndAddFolder,
  pickAndOpenWorkspace,
  primaryRoot,
  refreshDir,
  refreshWorkspace,
  removeFromWorkspace,
  restoreWorkspace,
  toggleDir,
  workspace,
} from '../../src/application/workspaceStore';
import { AppError } from '../../src/domain/fs';
import { emptyGitStatus, repositoryKey } from '../../src/domain/git';
import { installFakePorts } from '../helpers/ports';

const KEY = 'rustpilot.workspace.v2';
const LEGACY_KEY = 'rustpilot.workspace.v1';
let fakes: ReturnType<typeof installFakePorts>;

const saved = () => JSON.parse(fakes.storage.get(KEY) ?? 'null') as { root: string; name: string }[] | null;
const roots = () => workspace.projects.map((p) => p.root);

beforeEach(() => {
  fakes = installFakePorts();
  resetGit();
  closeWorkspace();
});

test('openWorkspace loads root children and persists the project list', async () => {
  fakes.fs.listDir.mockResolvedValue([{ name: 'src', path: 'C:\\p\\src', isDir: true }]);
  await openWorkspace('C:\\p');
  expect(workspace.root).toBe('C:\\p');
  expect(roots()).toEqual(['C:\\p']);
  expect(workspace.children['C:\\p']).toHaveLength(1);
  expect(saved()).toEqual([{ root: 'C:\\p', name: 'p' }]);
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

test('refreshWorkspace re-reads every project root and every expanded directory', async () => {
  await openWorkspace('C:\\p');
  await addFolderToWorkspace('D:\\q');
  await toggleDir('C:\\p\\src');
  await toggleDir('C:\\p\\closed');
  await toggleDir('C:\\p\\closed');
  fakes.fs.listDir.mockClear();
  fakes.fs.listDir.mockImplementation(async (path: string) => [{ name: 'fresh.ts', path: `${path}\\fresh.ts`, isDir: false }]);

  await refreshWorkspace();

  expect(fakes.fs.listDir.mock.calls.map((call) => call[0]).sort()).toEqual(['C:\\p', 'C:\\p\\src', 'D:\\q']);
  expect(workspace.children['C:\\p'][0].name).toBe('fresh.ts');
  expect(workspace.children['D:\\q'][0].name).toBe('fresh.ts');
});

test('refreshWorkspace also reads the Git status of every repository', async () => {
  fakes.git.repositories.mockResolvedValue([{ root: 'C:\\p', kind: 'repository' }]);
  await openWorkspace('C:\\p');
  fakes.git.status.mockClear();
  await refreshWorkspace();
  expect(fakes.git.status).toHaveBeenCalledWith('C:\\p');
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
  fakes.storage.set(KEY, JSON.stringify([{ root: 'C:\\old', name: 'old' }]));
  let finishRestore!: (entries: never[]) => void;
  fakes.fs.listDir.mockImplementationOnce(() => new Promise((resolve) => (finishRestore = resolve)));
  const restoring = restoreWorkspace();

  await openWorkspace('C:\\picked');
  finishRestore([]);
  await restoring;

  expect(roots()).toEqual(['C:\\picked']);
  expect(saved()).toEqual([{ root: 'C:\\picked', name: 'picked' }]);
});

test('toggleDir failure keeps dir collapsed and shows error', async () => {
  await openWorkspace('C:\\p');
  fakes.fs.listDir.mockRejectedValue(new AppError('permissionDenied', 'access denied'));
  await toggleDir('C:\\p\\secret');
  expect(workspace.expanded['C:\\p\\secret']).toBeFalsy();
  expect(fakes.dialog.showError).toHaveBeenCalledWith('access denied');
});

test('openWorkspace replaces the whole workspace and clears the previous cache', async () => {
  await openWorkspace('C:\\p');
  await addFolderToWorkspace('D:\\extra');
  await toggleDir('C:\\p\\src');
  await openWorkspace('C:\\q');
  expect(roots()).toEqual(['C:\\q']);
  expect(Object.keys(workspace.children)).toEqual(['C:\\q']);
  expect(workspace.expanded).toEqual({});
});

test('openWorkspace failure keeps the current workspace', async () => {
  await openWorkspace('C:\\p');
  fakes.fs.listDir.mockRejectedValue(new AppError('notFound', 'missing'));
  await expect(openWorkspace('C:\\gone')).rejects.toMatchObject({ kind: 'notFound' });
  expect(workspace.root).toBe('C:\\p');
  expect(saved()).toEqual([{ root: 'C:\\p', name: 'p' }]);
});

test('refreshDir replaces cached children', async () => {
  await openWorkspace('C:\\p');
  fakes.fs.listDir.mockResolvedValue([{ name: 'new.ts', path: 'C:\\p\\new.ts', isDir: false }]);
  await refreshDir('C:\\p');
  expect(workspace.children['C:\\p'].map((e) => e.name)).toEqual(['new.ts']);
});

test('collapseAll collapses every directory', async () => {
  await openWorkspace('C:\\p');
  await toggleDir('C:\\p\\src');
  collapseAll();
  expect(workspace.expanded).toEqual({});
});

// ---------- several projects ----------

test('a folder can be added to the workspace', async () => {
  await openWorkspace('C:\\p');
  await addFolderToWorkspace('D:\\other');
  expect(roots()).toEqual(['C:\\p', 'D:\\other']);
  expect(workspace.children['D:\\other']).toBeDefined();
  expect(saved()?.map((p) => p.root)).toEqual(['C:\\p', 'D:\\other']);
});

test('the first project is the primary one, which other features still use', async () => {
  await openWorkspace('C:\\p');
  await addFolderToWorkspace('D:\\other');
  expect(workspace.root).toBe('C:\\p');
  expect(primaryRoot()).toBe('C:\\p');
});

test('adding a folder to an empty workspace makes it the primary project', async () => {
  await addFolderToWorkspace('C:\\first');
  expect(workspace.root).toBe('C:\\first');
});

test('adding a folder that is already there changes nothing, whatever its spelling', async () => {
  await openWorkspace('C:\\p');
  fakes.fs.listDir.mockClear();
  await addFolderToWorkspace('c:/P/');
  expect(roots()).toEqual(['C:\\p']);
  expect(fakes.fs.listDir).not.toHaveBeenCalled();
});

test('a folder that cannot be listed is not added and the error is thrown', async () => {
  await openWorkspace('C:\\p');
  fakes.fs.listDir.mockRejectedValue(new AppError('notFound', 'missing'));
  await expect(addFolderToWorkspace('D:\\gone')).rejects.toMatchObject({ kind: 'notFound' });
  expect(roots()).toEqual(['C:\\p']);
});

test('removing a project drops its listings and keeps the others', async () => {
  await openWorkspace('C:\\p');
  await addFolderToWorkspace('D:\\other');
  await toggleDir('D:\\other\\src');
  removeFromWorkspace('D:\\other');
  expect(roots()).toEqual(['C:\\p']);
  expect(Object.keys(workspace.children)).toEqual(['C:\\p']);
  expect(workspace.expanded['D:\\other\\src']).toBeUndefined();
  expect(saved()).toEqual([{ root: 'C:\\p', name: 'p' }]);
});

test('removing the primary project promotes the next one', async () => {
  await openWorkspace('C:\\p');
  await addFolderToWorkspace('D:\\other');
  removeFromWorkspace('C:\\p');
  expect(workspace.root).toBe('D:\\other');
});

test('removing the last project empties the workspace', async () => {
  await openWorkspace('C:\\p');
  removeFromWorkspace('C:\\p');
  expect(workspace.root).toBeNull();
  expect(roots()).toEqual([]);
  expect(fakes.storage.get(KEY)).toBeNull();
});

test('adding and removing projects tells Git, so repositories follow the workspace', async () => {
  fakes.git.repositories.mockImplementation(async (root: string) => [{ root, kind: 'repository' }]);
  await openWorkspace('C:\\p');
  await addFolderToWorkspace('D:\\other');
  expect(git.order).toEqual([repositoryKey('C:\\p'), repositoryKey('D:\\other')]);
  removeFromWorkspace('D:\\other');
  expect(git.order).toEqual([repositoryKey('C:\\p')]);
  expect(fakes.git.unwatch).toHaveBeenCalledWith('D:\\other');
});

test('opening another workspace removes the repositories of the old one', async () => {
  fakes.git.repositories.mockImplementation(async (root: string) => [{ root, kind: 'repository' }]);
  await openWorkspace('C:\\p');
  await openWorkspace('C:\\q');
  expect(git.order).toEqual([repositoryKey('C:\\q')]);
});

// ---------- restoring ----------

test('restoreWorkspace reopens every saved project', async () => {
  fakes.storage.set(KEY, JSON.stringify([{ root: 'C:\\p', name: 'p' }, { root: 'D:\\q', name: 'q' }]));
  await restoreWorkspace();
  expect(roots()).toEqual(['C:\\p', 'D:\\q']);
  expect(workspace.root).toBe('C:\\p');
});

test('a workspace saved by the older single-folder version is upgraded', async () => {
  fakes.storage.set(LEGACY_KEY, 'C:\\old');
  await restoreWorkspace();
  expect(roots()).toEqual(['C:\\old']);
  expect(saved()).toEqual([{ root: 'C:\\old', name: 'old' }]);
  expect(fakes.storage.get(LEGACY_KEY)).toBeNull();
});

test('a project whose folder is gone is dropped and the rest are kept', async () => {
  fakes.storage.set(KEY, JSON.stringify([{ root: 'C:\\gone', name: 'gone' }, { root: 'C:\\p', name: 'p' }]));
  fakes.fs.listDir.mockImplementation(async (path: string) => {
    if (path === 'C:\\gone') throw new AppError('notFound', 'missing');
    return [];
  });
  await restoreWorkspace();
  expect(roots()).toEqual(['C:\\p']);
  expect(saved()).toEqual([{ root: 'C:\\p', name: 'p' }]);
  expect(fakes.dialog.showError).not.toHaveBeenCalled();
});

test('restoreWorkspace with only missing folders resets to empty state', async () => {
  fakes.storage.set(KEY, JSON.stringify([{ root: 'C:\\gone', name: 'gone' }]));
  fakes.fs.listDir.mockRejectedValue(new AppError('notFound', 'missing'));
  await restoreWorkspace();
  expect(workspace.root).toBeNull();
  expect(fakes.storage.get(KEY)).toBeNull();
  expect(fakes.dialog.showError).not.toHaveBeenCalled();
});

test('restoring loads the Git repositories of every project', async () => {
  fakes.storage.set(KEY, JSON.stringify([{ root: 'C:\\p', name: 'p' }, { root: 'D:\\q', name: 'q' }]));
  fakes.git.repositories.mockImplementation(async (root: string) => [{ root, kind: 'repository' }]);
  fakes.git.status.mockResolvedValue({ ...emptyGitStatus(), isRepository: true, branch: 'main' });
  await restoreWorkspace();
  expect(git.order).toHaveLength(2);
});

// ---------- pickers ----------

test('pickAndOpenWorkspace opens the chosen folder, and does nothing when cancelled', async () => {
  fakes.dialog.pickFolder.mockResolvedValueOnce(null);
  await pickAndOpenWorkspace();
  expect(workspace.root).toBeNull();
  fakes.dialog.pickFolder.mockResolvedValueOnce('C:\\picked');
  await pickAndOpenWorkspace();
  expect(workspace.root).toBe('C:\\picked');
});

test('pickAndOpenWorkspace reports a folder that cannot be opened', async () => {
  fakes.dialog.pickFolder.mockResolvedValueOnce('C:\\bad');
  fakes.fs.listDir.mockRejectedValue(new AppError('permissionDenied', 'access denied'));
  await pickAndOpenWorkspace();
  expect(fakes.dialog.showError).toHaveBeenCalledWith('access denied');
});

test('pickAndAddFolder adds the chosen folder to the workspace', async () => {
  await openWorkspace('C:\\p');
  fakes.dialog.pickFolder.mockResolvedValueOnce('D:\\more');
  await pickAndAddFolder();
  expect(roots()).toEqual(['C:\\p', 'D:\\more']);
});

test('closing the workspace forgets projects, repositories and the saved list', async () => {
  fakes.git.repositories.mockImplementation(async (root: string) => [{ root, kind: 'repository' }]);
  await openWorkspace('C:\\p');
  closeWorkspace();
  expect(roots()).toEqual([]);
  expect(git.order).toEqual([]);
  expect(fakes.storage.get(KEY)).toBeNull();
});
