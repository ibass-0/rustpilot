import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, expect, test } from 'vitest';
import { listDir, readTextFile, writeTextFile } from './fs';
import { IpcError } from './types';

afterEach(() => clearMocks());

test('listDir passes path and returns entries', async () => {
  mockIPC((cmd, args) => {
    expect(cmd).toBe('list_dir');
    expect(args).toEqual({ path: 'C:\\x' });
    return [{ name: 'a', path: 'C:\\x\\a', isDir: true }];
  });
  expect(await listDir('C:\\x')).toEqual([{ name: 'a', path: 'C:\\x\\a', isDir: true }]);
});

test('writeTextFile sends lineEnding as camelCase arg', async () => {
  let seen: unknown;
  mockIPC((_cmd, args) => {
    seen = args;
  });
  await writeTextFile('C:\\x\\a.txt', 'hi', 'crlf');
  expect(seen).toEqual({ path: 'C:\\x\\a.txt', text: 'hi', lineEnding: 'crlf' });
});

test('backend error becomes IpcError with kind', async () => {
  mockIPC(() => {
    throw { kind: 'notUtf8', message: 'not UTF-8' };
  });
  const err = await readTextFile('C:\\x\\b.bin').catch((e) => e);
  expect(err).toBeInstanceOf(IpcError);
  expect(err).toMatchObject({ kind: 'notUtf8', message: 'not UTF-8' });
});

test('unknown error shape becomes IpcError io', async () => {
  mockIPC(() => {
    throw 'boom';
  });
  await expect(readTextFile('C:\\x')).rejects.toMatchObject({ kind: 'io', message: 'boom' });
});
