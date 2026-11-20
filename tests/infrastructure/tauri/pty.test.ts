import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, expect, test, vi } from 'vitest';
import { AppError } from '../../../src/domain/fs';
import { createTauriPty } from '../../../src/infrastructure/tauri/pty';

afterEach(() => clearMocks());

type Sent = { cmd: string; args: Record<string, unknown> };

/** Record every command except the start-up clean-up, which has its own test. */
function recordCalls(result?: unknown): Sent[] {
  const calls: Sent[] = [];
  mockIPC((cmd, args) => {
    if (cmd !== 'terminal_close_all') calls.push({ cmd, args: args as Record<string, unknown> });
    return result;
  });
  return calls;
}

test('sessions left over from a previous page load are closed before the first shell opens', async () => {
  const order: string[] = [];
  mockIPC(async (cmd) => {
    if (cmd === 'terminal_close_all') await new Promise((resolve) => setTimeout(resolve, 20));
    order.push(cmd);
  });
  const pty = createTauriPty();
  await pty.open(1, 'cmd', null, { cols: 80, rows: 24 }, vi.fn(), vi.fn());
  await pty.open(2, 'cmd', null, { cols: 80, rows: 24 }, vi.fn(), vi.fn());
  expect(order).toEqual(['terminal_close_all', 'terminal_open', 'terminal_open']);
});

test('a failing clean-up does not stop shells from opening', async () => {
  const calls: string[] = [];
  mockIPC((cmd) => {
    calls.push(cmd);
    if (cmd === 'terminal_close_all') throw 'boom';
  });
  await createTauriPty().open(1, 'cmd', null, { cols: 80, rows: 24 }, vi.fn(), vi.fn());
  expect(calls).toContain('terminal_open');
});

test('listShells returns the profiles from the backend', async () => {
  const shells = [{ id: 'cmd', name: 'Command Prompt', program: 'C:\\cmd.exe', args: [] }];
  const calls = recordCalls(shells);
  expect(await createTauriPty().listShells()).toEqual(shells);
  expect(calls[0].cmd).toBe('terminal_shells');
});

test('open sends id, profileId, cwd and size with camelCase names', async () => {
  const calls = recordCalls();
  await createTauriPty().open(7, 'pwsh', 'C:\\p', { cols: 100, rows: 30 }, vi.fn(), vi.fn());
  expect(calls[0].cmd).toBe('terminal_open');
  expect(calls[0].args).toMatchObject({ id: 7, profileId: 'pwsh', cwd: 'C:\\p', cols: 100, rows: 30 });
  expect(calls[0].args.onEvent).toBeDefined();
});

test('events on the channel reach onOutput and onExit', async () => {
  const calls = recordCalls();
  const onOutput = vi.fn();
  const onExit = vi.fn();
  await createTauriPty().open(1, 'cmd', null, { cols: 80, rows: 24 }, onOutput, onExit);

  const channel = calls[0].args.onEvent as { onmessage: (event: unknown) => void };
  channel.onmessage({ type: 'output', data: 'hello', seq: 4 });
  channel.onmessage({ type: 'exit', code: 3 });

  expect(onOutput).toHaveBeenCalledWith('hello', 4);
  expect(onExit).toHaveBeenCalledWith(3);
});

test('write, resize and close call the matching commands', async () => {
  const calls = recordCalls();
  const pty = createTauriPty();
  await pty.write(2, 'dir\r');
  await pty.resize(2, { cols: 120, rows: 40 });
  await pty.acknowledge(2, 9);
  await pty.close(2);
  expect(calls).toEqual([
    { cmd: 'terminal_write', args: { id: 2, data: 'dir\r' } },
    { cmd: 'terminal_resize', args: { id: 2, cols: 120, rows: 40 } },
    { cmd: 'terminal_acknowledge', args: { id: 2, seq: 9 } },
    { cmd: 'terminal_close', args: { id: 2 } },
  ]);
});

test('a backend error becomes an AppError', async () => {
  mockIPC(() => {
    throw { kind: 'notFound', message: 'pwsh.exe was not found' };
  });
  const err = await createTauriPty().open(1, 'pwsh', null, { cols: 80, rows: 24 }, vi.fn(), vi.fn()).catch((e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ kind: 'notFound', message: 'pwsh.exe was not found' });
});
