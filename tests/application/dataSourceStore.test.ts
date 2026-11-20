import { beforeEach, expect, test } from 'vitest';
import {
  connectSource,
  dataSources,
  disconnectSource,
  loadSources,
  newSourceId,
  pickDatabaseFile,
  refreshSource,
  removeSource,
  removeSourceConfirmed,
  resetDataSources,
  saveSource,
  selectNode,
  tablesOf,
  testSource,
  toggleNode,
} from '../../src/application/dataSourceStore';
import type { DataNode, DataSourceConfig } from '../../src/domain/dataSource';
import { newConfig, nodeKey } from '../../src/domain/dataSource';
import { AppError } from '../../src/domain/fs';
import { installFakePorts } from '../helpers/ports';

const KEY = 'rustpilot.dataSources';
let fakes: ReturnType<typeof installFakePorts>;

const source = (id = 'a1', patch: Partial<DataSourceConfig> = {}): DataSourceConfig => ({
  ...newConfig('sqlite', id),
  name: `db-${id}`,
  filePath: 'C:\\shop.db',
  ...patch,
});

const node = (path: string[], kind: DataNode['kind'] = 'schema', hasChildren = true): DataNode => ({
  path,
  label: path[path.length - 1],
  kind,
  detail: null,
  hasChildren,
});

beforeEach(() => {
  fakes = installFakePorts();
  resetDataSources();
});

test('loads saved sources, all disconnected', () => {
  fakes.storage.set(KEY, JSON.stringify([source('a1'), source('b2')]));
  loadSources();
  expect(dataSources.sources.map((s) => s.id)).toEqual(['a1', 'b2']);
  expect(dataSources.status.a1).toBe('disconnected');
});

test('corrupt storage gives an empty list', () => {
  fakes.storage.set(KEY, '{not json');
  loadSources();
  expect(dataSources.sources).toEqual([]);
});

test('malformed entries are dropped', () => {
  fakes.storage.set(KEY, JSON.stringify([source('a1'), { id: 1 }, { ...source('b2'), engine: 'nope' }, null]));
  loadSources();
  expect(dataSources.sources.map((s) => s.id)).toEqual(['a1']);
});

test('saving adds a new source and replaces an existing one, and persists', async () => {
  await saveSource(source('a1'));
  await saveSource(source('b2'));
  await saveSource(source('a1', { name: 'renamed' }));
  expect(dataSources.sources.map((s) => s.name)).toEqual(['renamed', 'db-b2']);
  expect(JSON.parse(fakes.storage.get(KEY) ?? '[]')).toHaveLength(2);
});

test('editing a connected source disconnects it', async () => {
  await saveSource(source('a1'));
  await connectSource('a1');
  await saveSource(source('a1', { filePath: 'C:\\other.db' }));
  expect(fakes.dataSource.disconnect).toHaveBeenCalledWith('a1');
  expect(dataSources.status.a1).toBe('disconnected');
});

test('connecting marks the source connected', async () => {
  await saveSource(source());
  await connectSource('a1');
  expect(fakes.dataSource.connect).toHaveBeenCalledWith(source());
  expect(dataSources.status.a1).toBe('connected');
  expect(dataSources.errors.a1).toBeUndefined();
});

test('a failed connection keeps the message', async () => {
  fakes.dataSource.connect.mockRejectedValue(new AppError('notFound', 'File not found: C:\\shop.db'));
  await saveSource(source());
  await connectSource('a1');
  expect(dataSources.status.a1).toBe('error');
  expect(dataSources.errors.a1).toBe('File not found: C:\\shop.db');
});

test('expanding the root connects and loads its children', async () => {
  fakes.dataSource.children.mockResolvedValue([node(['main'])]);
  await saveSource(source());
  await toggleNode('a1', []);
  expect(dataSources.status.a1).toBe('connected');
  expect(dataSources.expanded.a1[nodeKey([])]).toBe(true);
  expect(dataSources.children.a1[nodeKey([])]).toEqual([node(['main'])]);
  expect(dataSources.loading.a1[nodeKey([])]).toBe(false);
});

test('a failed connect leaves the node collapsed and empty', async () => {
  fakes.dataSource.connect.mockRejectedValue(new AppError('connection', 'nope'));
  await saveSource(source());
  await toggleNode('a1', []);
  expect(dataSources.expanded.a1?.[nodeKey([])]).toBeFalsy();
  expect(fakes.dataSource.children).not.toHaveBeenCalled();
});

test('collapsing and expanding again does not reload', async () => {
  fakes.dataSource.children.mockResolvedValue([node(['main'])]);
  await saveSource(source());
  await toggleNode('a1', []);
  await toggleNode('a1', []);
  expect(dataSources.expanded.a1[nodeKey([])]).toBe(false);
  await toggleNode('a1', []);
  expect(dataSources.expanded.a1[nodeKey([])]).toBe(true);
  expect(fakes.dataSource.children).toHaveBeenCalledTimes(1);
});

test('a failure loading children collapses the node and shows the message', async () => {
  await saveSource(source());
  await connectSource('a1');
  fakes.dataSource.children.mockRejectedValue(new AppError('query', 'locked'));
  await toggleNode('a1', ['main']);
  expect(dataSources.expanded.a1[nodeKey(['main'])]).toBe(false);
  expect(dataSources.errors.a1).toBe('locked');
});

test('refresh drops the cache and reloads the open nodes', async () => {
  fakes.dataSource.children.mockImplementation(async (_id: string, path: string[]) =>
    path.length === 0 ? [node(['main'])] : [node(['main', 'tables'], 'folder')],
  );
  await saveSource(source());
  await toggleNode('a1', []);
  await toggleNode('a1', ['main']);
  fakes.dataSource.children.mockClear();
  await refreshSource('a1');
  expect(fakes.dataSource.children).toHaveBeenCalledTimes(2);
  expect(dataSources.expanded.a1[nodeKey(['main'])]).toBe(true);
});

test('disconnecting clears the tree', async () => {
  fakes.dataSource.children.mockResolvedValue([node(['main'])]);
  await saveSource(source());
  await toggleNode('a1', []);
  selectNode('a1', ['main']);
  await disconnectSource('a1');
  expect(dataSources.status.a1).toBe('disconnected');
  expect(dataSources.children.a1).toBeUndefined();
  expect(dataSources.expanded.a1).toBeUndefined();
  expect(dataSources.selected).toBeNull();
});

test('children that arrive after a disconnect are discarded', async () => {
  await saveSource(source());
  await connectSource('a1');
  let finish!: (nodes: DataNode[]) => void;
  fakes.dataSource.children.mockReturnValue(new Promise<DataNode[]>((resolve) => (finish = resolve)));
  const pending = toggleNode('a1', []);
  await disconnectSource('a1');
  finish([node(['main'])]);
  await pending;
  expect(dataSources.children.a1).toBeUndefined();
});

test('removing a connected source disconnects it and forgets it', async () => {
  await saveSource(source('a1'));
  await saveSource(source('b2'));
  await connectSource('a1');
  await removeSource('a1');
  expect(fakes.dataSource.disconnect).toHaveBeenCalledWith('a1');
  expect(dataSources.sources.map((s) => s.id)).toEqual(['b2']);
  expect(JSON.parse(fakes.storage.get(KEY) ?? '[]')).toHaveLength(1);
  expect(dataSources.status.a1).toBeUndefined();
});

test('tablesOf lists loaded tables with their loaded columns', async () => {
  fakes.dataSource.children.mockImplementation(async (_id: string, path: string[]) => {
    if (path.length === 0) return [node(['main'])];
    if (path.join('/') === 'main') return [node(['main', 'tables'], 'folder')];
    if (path.join('/') === 'main/tables') return [node(['main', 'tables', 'users'], 'table'), node(['main', 'tables', 'zed'], 'table')];
    return [node(['main', 'tables', 'users', 'id'], 'column', false), node(['main', 'tables', 'users', 'name'], 'column', false)];
  });
  await saveSource(source());
  await toggleNode('a1', []);
  await toggleNode('a1', ['main']);
  await toggleNode('a1', ['main', 'tables']);
  await toggleNode('a1', ['main', 'tables', 'users']);
  expect(tablesOf('a1')).toEqual({ 'main.users': ['id', 'name'], 'main.zed': [] });
});

test('testing a source reports success without saving it', async () => {
  const result = await testSource(source('zz'));
  expect(fakes.dataSource.test).toHaveBeenCalledWith(source('zz'));
  expect(result).toEqual({ ok: true, message: 'Connection succeeded.' });
  expect(dataSources.sources).toEqual([]);
});

test('a failing test reports the backend message', async () => {
  fakes.dataSource.test.mockRejectedValue(new AppError('notFound', 'File not found: C:/gone.db'));
  expect(await testSource(source('zz'))).toEqual({ ok: false, message: 'File not found: C:/gone.db' });
});

test('an invalid form is reported without calling the backend', async () => {
  expect(await testSource(source('zz', { filePath: null }))).toEqual({ ok: false, message: 'Choose a database file.' });
  expect(fakes.dataSource.test).not.toHaveBeenCalled();
});

test('picking a database file offers SQLite extensions first', async () => {
  fakes.dialog.pickFile.mockResolvedValue('C:/data/a.db');
  expect(await pickDatabaseFile()).toBe('C:/data/a.db');
  expect(fakes.dialog.pickFile.mock.calls[0][0][0].extensions).toEqual(['db', 'sqlite', 'sqlite3', 'db3']);
});

test('deleting asks first and keeps the source when declined', async () => {
  await saveSource(source('a1'));
  fakes.dialog.confirm.mockResolvedValueOnce(false);
  await removeSourceConfirmed('a1');
  expect(dataSources.sources).toHaveLength(1);
  expect(fakes.dialog.confirm.mock.calls[0][0]).toContain('db-a1');
  await removeSourceConfirmed('a1');
  expect(dataSources.sources).toHaveLength(0);
});

test('new ids are safe for file names and unique', () => {
  const a = newSourceId();
  expect(a).toMatch(/^[A-Za-z0-9-]+$/);
  expect(newSourceId()).not.toBe(a);
});
