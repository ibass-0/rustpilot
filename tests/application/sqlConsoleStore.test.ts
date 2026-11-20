import { beforeEach, expect, test } from 'vitest';
import {
  attach,
  attachedSource,
  isSqlFile,
  loadConsoles,
  openConsole,
  openTablePreview,
  resetSqlConsole,
  runAll,
  runAtCursor,
  runFile,
  setResultHeight,
  sqlConsole,
  stop,
} from '../../src/application/sqlConsoleStore';
import { connectSource, resetDataSources, saveSource } from '../../src/application/dataSourceStore';
import { closeTab, editor } from '../../src/application/editorStore';
import { newConfig, type DataSourceConfig } from '../../src/domain/dataSource';
import { AppError } from '../../src/domain/fs';
import type { SqlResult } from '../../src/domain/sql';
import { emptySqlResult, installFakePorts } from '../helpers/ports';

const FILE = 'C:\\data\\consoles\\a1.sql';
const OTHER = 'C:\\p\\query.sql';
const config: DataSourceConfig = { ...newConfig('sqlite', 'a1'), name: 'Shop', filePath: 'C:\\shop.db' };
const rows = (n: number): SqlResult =>
  emptySqlResult({ columns: [{ name: 'x', typeName: 'INTEGER' }], rows: Array.from({ length: n }, (_, i) => [i]) });

let fakes: ReturnType<typeof installFakePorts>;

beforeEach(async () => {
  installFakePorts();
  for (const tab of [...editor.tabs]) await closeTab(tab.path);
  fakes = installFakePorts();
  resetDataSources();
  resetSqlConsole();
  await saveSource(config);
  await connectSource('a1');
});

test('opening a console opens its file and attaches the connection', async () => {
  await openConsole('a1');
  expect(fakes.dataSource.consolePath).toHaveBeenCalledWith('a1');
  expect(fakes.fs.readTextFile).toHaveBeenCalledWith(FILE);
  expect(editor.activePath).toBe(FILE);
  expect(attachedSource(FILE)).toBe('a1');
});

test('attachments are remembered across sessions and can be removed', () => {
  attach(OTHER, 'a1');
  resetSqlConsole();
  loadConsoles();
  expect(attachedSource(OTHER)).toBe('a1');
  attach(OTHER, null);
  resetSqlConsole();
  loadConsoles();
  expect(attachedSource(OTHER)).toBeNull();
});

test('corrupt attachment storage is ignored', () => {
  fakes.storage.set('rustpilot.sqlAttachments', '{oops');
  loadConsoles();
  expect(attachedSource(OTHER)).toBeNull();
});

test('running at the cursor executes the statement under it', async () => {
  attach(OTHER, 'a1');
  fakes.dataSource.execute.mockResolvedValue(rows(2));
  await runAtCursor(OTHER, 'select 1;\nselect 2;', 2, 2);
  expect(fakes.dataSource.execute).toHaveBeenCalledTimes(1);
  expect(fakes.dataSource.execute.mock.calls[0][0]).toBe('a1');
  expect(fakes.dataSource.execute.mock.calls[0][2]).toBe('select 1');
  expect(sqlConsole.results[OTHER].result?.rows).toHaveLength(2);
  expect(sqlConsole.results[OTHER].error).toBeNull();
  expect(sqlConsole.running).toBeNull();
});

test('a selection runs every statement in it, in order, and shows the last result with rows', async () => {
  attach(OTHER, 'a1');
  fakes.dataSource.execute
    .mockResolvedValueOnce(rows(1))
    .mockResolvedValueOnce(emptySqlResult({ rowsAffected: 1 }));
  const text = 'select 1; update t set a = 1;';
  await runAtCursor(OTHER, text, 0, text.length);
  expect(fakes.dataSource.execute.mock.calls.map((c) => c[2])).toEqual(['select 1', 'update t set a = 1']);
  expect(sqlConsole.results[OTHER].result?.columns).toHaveLength(1);
});

test('an error stops the remaining statements and is shown', async () => {
  attach(OTHER, 'a1');
  fakes.dataSource.execute.mockRejectedValueOnce(new AppError('query', 'no such table: t'));
  const text = 'select * from t; select 2;';
  await runAtCursor(OTHER, text, 0, text.length);
  expect(fakes.dataSource.execute).toHaveBeenCalledTimes(1);
  expect(sqlConsole.results[OTHER]).toMatchObject({ result: null, error: 'no such table: t', sql: 'select * from t' });
});

test('run all executes the whole file', async () => {
  attach(OTHER, 'a1');
  await runAll(OTHER, 'select 1;\nselect 2;');
  expect(fakes.dataSource.execute).toHaveBeenCalledTimes(2);
});

test('nothing to run does nothing', async () => {
  attach(OTHER, 'a1');
  await runAtCursor(OTHER, '-- just a note', 3, 3);
  expect(fakes.dataSource.execute).not.toHaveBeenCalled();
  expect(sqlConsole.results[OTHER]).toBeUndefined();
});

test('a file without a connection explains what to do', async () => {
  await runAtCursor(OTHER, 'select 1', 0, 0);
  expect(fakes.dataSource.execute).not.toHaveBeenCalled();
  expect(sqlConsole.results[OTHER].error).toBe('Choose a connection for this file.');
});

test('a disconnected source is connected first', async () => {
  resetDataSources();
  await saveSource(config);
  attach(OTHER, 'a1');
  await runAtCursor(OTHER, 'select 1', 0, 0);
  expect(fakes.dataSource.connect).toHaveBeenCalledTimes(2);
  expect(fakes.dataSource.execute).toHaveBeenCalledTimes(1);
});

test('a failed connection is reported and nothing runs', async () => {
  resetDataSources();
  await saveSource(config);
  fakes.dataSource.connect.mockRejectedValue(new AppError('notFound', 'File not found: C:\\shop.db'));
  attach(OTHER, 'a1');
  await runAtCursor(OTHER, 'select 1', 0, 0);
  expect(fakes.dataSource.execute).not.toHaveBeenCalled();
  expect(sqlConsole.results[OTHER].error).toBe('File not found: C:\\shop.db');
});

test('a result that arrives after a newer run started is discarded', async () => {
  attach(OTHER, 'a1');
  const finish: ((r: SqlResult) => void)[] = [];
  fakes.dataSource.execute.mockImplementation(() => new Promise<SqlResult>((resolve) => finish.push(resolve)));
  const first = runAtCursor(OTHER, 'select 1', 0, 0);
  await Promise.resolve();
  await Promise.resolve();
  const second = runAtCursor(OTHER, 'select 2', 0, 0);
  await new Promise((r) => setTimeout(r, 0));
  finish[1](rows(2));
  await second;
  finish[0](rows(1));
  await first;
  expect(sqlConsole.results[OTHER].result?.rows).toHaveLength(2);
  expect(sqlConsole.results[OTHER].sql).toBe('select 2');
});

test('starting a run while another is running cancels the old one', async () => {
  attach(OTHER, 'a1');
  fakes.dataSource.execute.mockImplementationOnce(() => new Promise<SqlResult>(() => {}));
  void runAtCursor(OTHER, 'select 1', 0, 0);
  await new Promise((r) => setTimeout(r, 0));
  const runningId = sqlConsole.running?.executionId;
  expect(runningId).toBeGreaterThan(0);
  await runAtCursor(OTHER, 'select 2', 0, 0);
  expect(fakes.dataSource.cancel).toHaveBeenCalledWith(runningId);
});

test('stop cancels the running statement and reports it', async () => {
  attach(OTHER, 'a1');
  let reject!: (e: unknown) => void;
  fakes.dataSource.execute.mockImplementation(() => new Promise<SqlResult>((_, r) => (reject = r)));
  const running = runAtCursor(OTHER, 'select 1', 0, 0);
  await new Promise((r) => setTimeout(r, 0));
  const id = sqlConsole.running?.executionId;
  await stop();
  expect(fakes.dataSource.cancel).toHaveBeenCalledWith(id);
  reject(new AppError('cancelled', 'The query was cancelled.'));
  await running;
  expect(sqlConsole.results[OTHER].error).toBe('Cancelled.');
  expect(sqlConsole.running).toBeNull();
});

test('stop with nothing running does nothing', async () => {
  await stop();
  expect(fakes.dataSource.cancel).not.toHaveBeenCalled();
});

test('opening a table preview fills the console and runs it', async () => {
  fakes.dataSource.execute.mockResolvedValue(rows(3));
  await openTablePreview('a1', 'main', 'users');
  expect(fakes.buffers.text(FILE)).toContain('SELECT * FROM "main"."users" LIMIT 500;');
  expect(editor.tabs.find((t) => t.path === FILE)?.dirty).toBe(true);
  expect(fakes.dataSource.execute.mock.calls[0][2]).toBe('SELECT * FROM "main"."users" LIMIT 500;');
  expect(sqlConsole.results[FILE].result?.rows).toHaveLength(3);
});

test('only .sql files are consoles', () => {
  expect(isSqlFile('C:/p/query.sql')).toBe(true);
  expect(isSqlFile('C:/p/QUERY.SQL')).toBe(true);
  expect(isSqlFile('C:/p/query.ts')).toBe(false);
});

test('runFile runs the statement under the cursor of the open buffer', async () => {
  attach(OTHER, 'a1');
  fakes.buffers.open(OTHER, 'select 1;\nselect 2;');
  fakes.buffers.selections.set(OTHER, { from: 12, to: 12 });
  await runFile(OTHER);
  expect(fakes.dataSource.execute.mock.calls.map((c) => c[2])).toEqual(['select 2']);
});

test('runFile with a selection runs just that selection', async () => {
  attach(OTHER, 'a1');
  fakes.buffers.open(OTHER, 'select 1;\nselect 2;\nselect 3;');
  fakes.buffers.selections.set(OTHER, { from: 0, to: 19 });
  await runFile(OTHER);
  expect(fakes.dataSource.execute.mock.calls.map((c) => c[2])).toEqual(['select 1', 'select 2']);
});

test('runFile with all runs the whole file regardless of the cursor', async () => {
  attach(OTHER, 'a1');
  fakes.buffers.open(OTHER, 'select 1;\nselect 2;');
  fakes.buffers.selections.set(OTHER, { from: 0, to: 0 });
  await runFile(OTHER, true);
  expect(fakes.dataSource.execute).toHaveBeenCalledTimes(2);
});

test('runFile ignores a file that is not open', async () => {
  attach(OTHER, 'a1');
  await runFile(OTHER);
  expect(fakes.dataSource.execute).not.toHaveBeenCalled();
});

test('the result panel height is remembered and kept within sensible bounds', () => {
  setResultHeight(300);
  expect(sqlConsole.resultHeight).toBe(300);
  resetSqlConsole();
  loadConsoles();
  expect(sqlConsole.resultHeight).toBe(300);
  setResultHeight(10);
  expect(sqlConsole.resultHeight).toBe(80);
  setResultHeight(99999);
  expect(sqlConsole.resultHeight).toBe(800);
});
