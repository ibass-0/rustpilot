import { beforeEach, expect, test } from 'vitest';
import {
  answerPassword,
  connectSource,
  dataSources,
  loadSources,
  removeSource,
  resetDataSources,
  saveSource,
  testSource,
} from '../../src/application/dataSourceStore';
import { newConfig, type DataSourceConfig } from '../../src/domain/dataSource';
import { AppError } from '../../src/domain/fs';
import { installFakePorts } from '../helpers/ports';

const KEY = 'rustpilot.dataSources';
let fakes: ReturnType<typeof installFakePorts>;

const sqlite = (id = 'a1'): DataSourceConfig => ({ ...newConfig('sqlite', id), name: `db-${id}`, filePath: 'C:/shop.db' });

const pg = (id = 'p1', patch: Partial<DataSourceConfig> = {}): DataSourceConfig => ({
  ...newConfig('postgres', id),
  name: `pg-${id}`,
  host: 'db.example.com',
  user: 'app',
  ...patch,
});

/** Let pending promise callbacks run. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  fakes = installFakePorts();
  resetDataSources();
});

test('configs saved before server support are upgraded when loaded', () => {
  fakes.storage.set(KEY, JSON.stringify([{ id: 'a1', name: 'Old', engine: 'sqlite', filePath: 'C:/old.db', readOnly: false }]));
  loadSources();
  expect(dataSources.sources[0]).toMatchObject({ id: 'a1', host: null, sslMode: 'prefer', savePassword: false });
});

test('a server without a saved password asks for it, then connects with it', async () => {
  await saveSource(pg('p1'));
  const connecting = connectSource('p1');
  await flush();
  expect(dataSources.passwordRequest).toEqual({ id: 'p1', name: 'pg-p1' });
  expect(fakes.dataSource.connect).not.toHaveBeenCalled();
  answerPassword('s3cret');
  await connecting;
  expect(fakes.dataSource.connect).toHaveBeenCalledWith(pg('p1'), 's3cret');
  expect(dataSources.status.p1).toBe('connected');
  expect(dataSources.passwordRequest).toBeNull();
});

test('cancelling the password prompt connects nothing and is not an error', async () => {
  await saveSource(pg('p1'));
  const connecting = connectSource('p1');
  await flush();
  answerPassword(null);
  await connecting;
  expect(fakes.dataSource.connect).not.toHaveBeenCalled();
  expect(dataSources.status.p1).toBe('disconnected');
  expect(dataSources.errors.p1).toBeUndefined();
});

test('an empty password is still a password', async () => {
  await saveSource(pg('p1'));
  const connecting = connectSource('p1');
  await flush();
  answerPassword('');
  await connecting;
  expect(fakes.dataSource.connect).toHaveBeenCalledWith(pg('p1'), '');
});

test('a saved password is left to the backend: no prompt and no password argument', async () => {
  await saveSource(pg('p1', { savePassword: true }));
  await connectSource('p1');
  expect(dataSources.passwordRequest).toBeNull();
  expect(fakes.dataSource.connect.mock.calls[0]).toEqual([pg('p1', { savePassword: true })]);
});

test('SQLite never asks for a password', async () => {
  await saveSource(sqlite('a1'));
  await connectSource('a1');
  expect(dataSources.passwordRequest).toBeNull();
  expect(fakes.dataSource.connect.mock.calls[0]).toEqual([sqlite('a1')]);
});

test('prompts for several servers come one at a time', async () => {
  await saveSource(pg('p1'));
  await saveSource(pg('p2'));
  const first = connectSource('p1');
  const second = connectSource('p2');
  await flush();
  expect(dataSources.passwordRequest?.id).toBe('p1');
  answerPassword('one');
  await first;
  await flush();
  expect(dataSources.passwordRequest?.id).toBe('p2');
  answerPassword('two');
  await second;
  expect(fakes.dataSource.connect.mock.calls.map((c) => c[1])).toEqual(['one', 'two']);
});

test('an authentication failure shows the server message', async () => {
  fakes.dataSource.connect.mockRejectedValue(new AppError('auth', 'password authentication failed for user "app"'));
  await saveSource(pg('p1', { savePassword: true }));
  await connectSource('p1');
  expect(dataSources.status.p1).toBe('error');
  expect(dataSources.errors.p1).toBe('password authentication failed for user "app"');
});

test('saving with a password and Save password on stores it in the credential manager', async () => {
  await saveSource(pg('p1', { savePassword: true }), 'hunter2');
  expect(fakes.dataSource.saveSecret).toHaveBeenCalledWith('p1', 'hunter2');
});

test('saving with Save password on and no new password keeps the saved one', async () => {
  await saveSource(pg('p1', { savePassword: true }));
  await saveSource(pg('p1', { savePassword: true, host: 'other' }), '');
  expect(fakes.dataSource.saveSecret).not.toHaveBeenCalled();
  expect(fakes.dataSource.forgetSecret).not.toHaveBeenCalled();
});

test('a typed password is not stored when Save password is off', async () => {
  await saveSource(pg('p1', { savePassword: false }), 'hunter2');
  expect(fakes.dataSource.saveSecret).not.toHaveBeenCalled();
});

test('turning Save password off forgets the stored password', async () => {
  await saveSource(pg('p1', { savePassword: true }), 'hunter2');
  await saveSource(pg('p1', { savePassword: false }));
  expect(fakes.dataSource.forgetSecret).toHaveBeenCalledWith('p1');
});

test('switching a server source to SQLite forgets the stored password', async () => {
  await saveSource(pg('p1', { savePassword: true }), 'hunter2');
  await saveSource({ ...sqlite('p1') });
  expect(fakes.dataSource.forgetSecret).toHaveBeenCalledWith('p1');
});

test('a failure of the credential store is reported and nothing is saved', async () => {
  fakes.dataSource.saveSecret.mockRejectedValue(new AppError('io', 'The credential store failed'));
  await expect(saveSource(pg('p1', { savePassword: true }), 'hunter2')).rejects.toThrow('The credential store failed');
  expect(dataSources.sources).toEqual([]);
});

test('removing a server forgets its saved password', async () => {
  await saveSource(pg('p1', { savePassword: true }));
  await removeSource('p1');
  expect(fakes.dataSource.forgetSecret).toHaveBeenCalledWith('p1');
});

test('removing a source whose password was never saved does not touch the credential store', async () => {
  await saveSource(pg('p1'));
  await saveSource(sqlite('a1'));
  await removeSource('p1');
  await removeSource('a1');
  expect(fakes.dataSource.forgetSecret).not.toHaveBeenCalled();
});

test('removing still works when the credential store fails', async () => {
  fakes.dataSource.forgetSecret.mockRejectedValue(new AppError('io', 'locked'));
  await saveSource(pg('p1', { savePassword: true }));
  await removeSource('p1');
  expect(dataSources.sources).toEqual([]);
});

test('testing passes a typed password along, and none when it is left to the backend', async () => {
  await testSource(pg('p1'), 'typed');
  expect(fakes.dataSource.test).toHaveBeenCalledWith(pg('p1'), 'typed');
  await testSource(pg('p1', { savePassword: true }));
  expect(fakes.dataSource.test.mock.calls[1]).toEqual([pg('p1', { savePassword: true })]);
});

test('a password never appears in the store or in storage', async () => {
  await saveSource(pg('p1', { savePassword: true }), 'topsecret-value');
  await saveSource(pg('p2'));
  const connecting = connectSource('p2');
  await flush();
  answerPassword('another-secret');
  await connecting;
  const everything = JSON.stringify(dataSources) + (fakes.storage.get(KEY) ?? '');
  expect(everything).not.toContain('topsecret-value');
  expect(everything).not.toContain('another-secret');
});
