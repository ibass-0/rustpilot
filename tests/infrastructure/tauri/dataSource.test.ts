import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, expect, test } from 'vitest';
import { newConfig, type DataSourceConfig } from '../../../src/domain/dataSource';
import { tauriDataSource } from '../../../src/infrastructure/tauri/dataSource';

afterEach(() => clearMocks());

const config: DataSourceConfig = { ...newConfig('sqlite', 'a1'), name: 'Shop', filePath: 'C:/data/shop.db' };

function record(result: unknown = null) {
  const calls: { command: string; args: unknown }[] = [];
  mockIPC((command, args) => {
    calls.push({ command, args });
    return result;
  });
  return calls;
}

test('test and connect send the whole config and no password by default', async () => {
  const calls = record();
  await tauriDataSource.test(config);
  await tauriDataSource.connect(config);
  expect(calls).toEqual([
    { command: 'ds_test', args: { config, password: null } },
    { command: 'ds_connect', args: { config, password: null } },
  ]);
});

test('test and connect pass along a typed password', async () => {
  const calls = record();
  await tauriDataSource.test(config, 'p@ss');
  await tauriDataSource.connect(config, 'p@ss');
  expect(calls).toEqual([
    { command: 'ds_test', args: { config, password: 'p@ss' } },
    { command: 'ds_connect', args: { config, password: 'p@ss' } },
  ]);
});

test('saveSecret and forgetSecret address the credential by data source id', async () => {
  const calls = record();
  await tauriDataSource.saveSecret('a1', 'p@ss');
  await tauriDataSource.forgetSecret('a1');
  expect(calls).toEqual([
    { command: 'ds_save_secret', args: { id: 'a1', password: 'p@ss' } },
    { command: 'ds_forget_secret', args: { id: 'a1' } },
  ]);
});

test('an authentication failure keeps its kind', async () => {
  mockIPC(() => {
    throw { kind: 'auth', message: 'A password is required.' };
  });
  await expect(tauriDataSource.connect(config)).rejects.toMatchObject({ kind: 'auth' });
});

test('disconnect and children name the connection', async () => {
  const calls = record([]);
  await tauriDataSource.disconnect('a1');
  await tauriDataSource.children('a1', ['main', 'tables']);
  expect(calls).toEqual([
    { command: 'ds_disconnect', args: { id: 'a1' } },
    { command: 'ds_children', args: { id: 'a1', path: ['main', 'tables'] } },
  ]);
});

test('consolePath resolves to the file path', async () => {
  record('C:\\data\\consoles\\a1.sql');
  await expect(tauriDataSource.consolePath('a1')).resolves.toBe('C:\\data\\consoles\\a1.sql');
});

test('execute sends the execution id in camelCase and the sql as data', async () => {
  const result = { columns: [], rows: [], truncated: false, rowsAffected: 1, elapsedMs: 2 };
  const calls = record(result);
  await expect(tauriDataSource.execute('a1', 7, "select 'x'; --")).resolves.toEqual(result);
  expect(calls).toEqual([{ command: 'sql_execute', args: { id: 'a1', executionId: 7, sql: "select 'x'; --" } }]);
});

test('cancel sends the execution id', async () => {
  const calls = record();
  await tauriDataSource.cancel(7);
  expect(calls).toEqual([{ command: 'sql_cancel', args: { executionId: 7 } }]);
});

test('backend errors become AppErrors with their kind', async () => {
  mockIPC(() => {
    throw { kind: 'query', message: 'near "SELEC": syntax error' };
  });
  await expect(tauriDataSource.execute('a1', 1, 'SELEC 1')).rejects.toMatchObject({
    kind: 'query',
    message: 'near "SELEC": syntax error',
  });
});
