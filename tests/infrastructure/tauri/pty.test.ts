import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, expect, test, vi } from 'vitest';
import { AppError } from '../../../src/domain/fs';
import { tauriPty } from '../../../src/infrastructure/tauri/pty';

afterEach(() => clearMocks());

type Sent = { cmd: string; args: Record<string, unknown> };

function recordCalls(result?: unknown): Sent[] {
  const calls: Sent[] = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args: args as Record<string, unknown> });
    return result;
  });
  return calls;
}

test('listShells returns the profiles from the backend', async () => {
  const shells = [{ id: 'cmd', name: 'Command Prompt', program: 'C:\\cmd.exe', args: [] }];
  const calls = recordCalls(shells);
  expect(await tauriPty.listShells()).toEqual(shells);
  expect(calls[0].cmd).toBe('terminal_shells');
});

test('open sends id, profileId, cwd and size with camelCase names', async () => {
  const calls = recordCalls();
  await tauriPty.open(7, 'pwsh', 'C:\\p', { cols: 100, rows: 30 }, vi.fn(), vi.fn());
  expect(calls[0].cmd).toBe('terminal_open');
  expect(calls[0].args).toMatchObject({ id: 7, profileId: 'pwsh', cwd: 'C:\\p', cols: 100, rows: 30 });
  expect(calls[0].args.onEvent).toBeDefined();
});

test('events on the channel reach onOutput and onExit', async () => {
  const calls = recordCalls();
  const onOutput = vi.fn();
  const onExit = vi.fn();
  await tauriPty.open(1, 'cmd', null, { cols: 80, rows: 24 }, onOutput, onExit);

  const channel = calls[0].args.onEvent as { onmessage: (event: unknown) => void };
  channel.onmessage({ type: 'output', data: 'hello' });
  channel.onmessage({ type: 'exit', code: 3 });

  expect(onOutput).toHaveBeenCalledWith('hello');
  expect(onExit).toHaveBeenCalledWith(3);
});

test('write, resize and close call the matching commands', async () => {
  const calls = recordCalls();
  await tauriPty.write(2, 'dir\r');
  await tauriPty.resize(2, { cols: 120, rows: 40 });
  await tauriPty.close(2);
  expect(calls).toEqual([
    { cmd: 'terminal_write', args: { id: 2, data: 'dir\r' } },
    { cmd: 'terminal_resize', args: { id: 2, cols: 120, rows: 40 } },
    { cmd: 'terminal_close', args: { id: 2 } },
  ]);
});

test('a backend error becomes an AppError', async () => {
  mockIPC(() => {
    throw { kind: 'notFound', message: 'pwsh.exe was not found' };
  });
  const err = await tauriPty.open(1, 'pwsh', null, { cols: 80, rows: 24 }, vi.fn(), vi.fn()).catch((e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ kind: 'notFound', message: 'pwsh.exe was not found' });
});
