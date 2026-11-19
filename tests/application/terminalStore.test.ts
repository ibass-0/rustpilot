import { beforeEach, expect, test, vi } from 'vitest';
import {
  activateTerminal,
  closeTerminal,
  ensureTerminal,
  loadShells,
  openTerminal,
  terminals,
} from '../../src/application/terminalStore';
import { closeWorkspace, openWorkspace } from '../../src/application/workspaceStore';
import { AppError } from '../../src/domain/fs';
import { FAKE_SHELLS, installFakePorts } from '../helpers/ports';

let fakes: ReturnType<typeof installFakePorts>;

beforeEach(async () => {
  // Close whatever the previous test left open, then start from fresh fakes.
  installFakePorts();
  for (const tab of [...terminals.tabs]) await closeTerminal(tab.id);
  closeWorkspace();
  fakes = installFakePorts();
});

const onlyTab = () => {
  expect(terminals.tabs).toHaveLength(1);
  return terminals.tabs[0];
};

test('loadShells stores the profiles the backend reports', async () => {
  await loadShells();
  expect(terminals.shells).toEqual(FAKE_SHELLS);
});

test('loadShells calls made at the same time share one request', async () => {
  await Promise.all([loadShells(), loadShells(), loadShells()]);
  expect(fakes.pty.listShells).toHaveBeenCalledTimes(1);
});

test('openTerminal opens the default shell in the workspace root at 80x24', async () => {
  await openWorkspace('C:\\p');
  await openTerminal();
  const tab = onlyTab();
  expect(tab).toMatchObject({ title: 'PowerShell', profileId: 'pwsh', exited: false });
  expect(fakes.pty.open).toHaveBeenCalledWith(
    tab.id,
    'pwsh',
    'C:\\p',
    { cols: 80, rows: 24 },
    expect.any(Function),
    expect.any(Function),
  );
});

test('without a workspace the terminal opens with no folder, leaving the choice to the backend', async () => {
  await openTerminal();
  expect(fakes.pty.open.mock.calls[0][2]).toBeNull();
});

test('openTerminal with a profile id opens that shell', async () => {
  await openTerminal('cmd');
  expect(onlyTab()).toMatchObject({ title: 'Command Prompt', profileId: 'cmd' });
  expect(fakes.pty.open.mock.calls[0][1]).toBe('cmd');
});

test('openTerminal with no shells shows an error and adds no tab', async () => {
  fakes.pty.listShells.mockResolvedValue([]);
  await openTerminal();
  expect(terminals.tabs).toEqual([]);
  expect(fakes.pty.open).not.toHaveBeenCalled();
  expect(fakes.dialog.showError).toHaveBeenCalledWith('No shell was found on this computer.');
});

test('a new terminal becomes the active tab', async () => {
  await openTerminal();
  await openTerminal('cmd');
  expect(terminals.activeId).toBe(terminals.tabs[1].id);
});

test('the screen exists before the shell starts, so no early output is lost', async () => {
  let screenCreatedFirst = false;
  fakes.pty.open.mockImplementationOnce(async () => {
    screenCreatedFirst = fakes.screens.create.mock.calls.length === 1;
  });
  await openTerminal();
  expect(screenCreatedFirst).toBe(true);
});

test('output from the shell is written to that terminal screen only', async () => {
  await openTerminal();
  await openTerminal('cmd');
  const [first, second] = terminals.tabs;
  fakes.terminal.emitOutput(second.id, 'hello');
  expect(fakes.screens.write).toHaveBeenCalledTimes(1);
  expect(fakes.screens.write).toHaveBeenCalledWith(second.id, 'hello');
  expect(first.id).not.toBe(second.id);
});

test('typing on the screen is sent to the shell', async () => {
  await openTerminal();
  fakes.terminal.type(onlyTab().id, 'dir\r');
  expect(fakes.pty.write).toHaveBeenCalledWith(onlyTab().id, 'dir\r');
});

test('input produced while the shell is still opening is delivered, in order, once it is open', async () => {
  // ConPTY asks for the cursor position the moment it starts; the screen answers
  // before the open call has returned. Losing that answer would hang the shell.
  let finishOpen!: () => void;
  fakes.pty.open.mockImplementationOnce((id: number, ...rest: unknown[]) => {
    fakes.terminal.register(id, rest[3] as (data: string) => void, rest[4] as (code: number) => void);
    return new Promise<void>((resolve) => (finishOpen = resolve));
  });
  const opening = openTerminal();
  // The tab appears once the shells have been detected; the shell itself is still starting.
  await vi.waitFor(() => expect(terminals.tabs).toHaveLength(1));
  const id = onlyTab().id;

  fakes.terminal.type(id, '\x1b[1;1R');
  fakes.terminal.type(id, 'a');
  expect(fakes.pty.write).not.toHaveBeenCalled();

  finishOpen();
  await opening;
  expect(fakes.pty.write.mock.calls).toEqual([[id, '\x1b[1;1R'], [id, 'a']]);
});

test('a resize after opening is sent to the shell', async () => {
  await openTerminal();
  fakes.terminal.resizeScreen(onlyTab().id, { cols: 120, rows: 40 });
  expect(fakes.pty.resize).toHaveBeenCalledWith(onlyTab().id, { cols: 120, rows: 40 });
});

test('a resize that arrives while the shell is still opening is sent once it is open', async () => {
  let finishOpen!: () => void;
  fakes.pty.open.mockImplementationOnce(() => new Promise<void>((resolve) => (finishOpen = resolve)));
  const opening = openTerminal();
  // The tab appears once the shells have been detected; the shell itself is still starting.
  await vi.waitFor(() => expect(terminals.tabs).toHaveLength(1));
  const id = onlyTab().id;

  fakes.terminal.resizeScreen(id, { cols: 100, rows: 30 });
  fakes.terminal.resizeScreen(id, { cols: 132, rows: 43 });
  expect(fakes.pty.resize).not.toHaveBeenCalled();

  finishOpen();
  await opening;
  expect(fakes.pty.resize.mock.calls).toEqual([[id, { cols: 132, rows: 43 }]]);
});

test('a terminal that kept its initial size is not resized after opening', async () => {
  await openTerminal();
  expect(fakes.pty.resize).not.toHaveBeenCalled();
});

test('when the shell exits the tab is marked exited and a notice is written', async () => {
  await openTerminal();
  const id = onlyTab().id;
  fakes.terminal.emitExit(id, 0);
  expect(onlyTab().exited).toBe(true);
  expect(fakes.screens.write).toHaveBeenCalledWith(id, expect.stringContaining('[Process exited with code 0]'));
});

test('typing and resizing after exit are not sent anywhere', async () => {
  await openTerminal();
  const id = onlyTab().id;
  fakes.terminal.emitExit(id, 1);
  fakes.terminal.type(id, 'x');
  fakes.terminal.resizeScreen(id, { cols: 90, rows: 20 });
  expect(fakes.pty.write).not.toHaveBeenCalled();
  expect(fakes.pty.resize).not.toHaveBeenCalled();
});

test('a shell that fails to start shows the error and leaves no tab or screen', async () => {
  fakes.pty.open.mockRejectedValueOnce(new AppError('notFound', 'pwsh.exe was not found'));
  await openTerminal();
  expect(terminals.tabs).toEqual([]);
  expect(terminals.activeId).toBeNull();
  expect(fakes.screens.dispose).toHaveBeenCalledTimes(1);
  expect(fakes.dialog.showError).toHaveBeenCalledWith('pwsh.exe was not found');
});

test('closeTerminal closes the shell, disposes the screen and removes the tab', async () => {
  await openTerminal();
  const id = onlyTab().id;
  await closeTerminal(id);
  expect(fakes.pty.close).toHaveBeenCalledWith(id);
  expect(fakes.screens.dispose).toHaveBeenCalledWith(id);
  expect(terminals.tabs).toEqual([]);
  expect(terminals.activeId).toBeNull();
});

test('closing an exited terminal does not ask the backend to close it again', async () => {
  await openTerminal();
  const id = onlyTab().id;
  fakes.terminal.emitExit(id, 0);
  await closeTerminal(id);
  expect(fakes.pty.close).not.toHaveBeenCalled();
  expect(fakes.screens.dispose).toHaveBeenCalledWith(id);
});

test('a terminal closed while its shell is still starting is shut down once it has started', async () => {
  let finishOpen!: () => void;
  fakes.pty.open.mockImplementationOnce(() => new Promise<void>((resolve) => (finishOpen = resolve)));
  const opening = openTerminal();
  // The tab appears once the shells have been detected; the shell itself is still starting.
  await vi.waitFor(() => expect(terminals.tabs).toHaveLength(1));
  const id = onlyTab().id;

  await closeTerminal(id);
  fakes.pty.close.mockClear();
  finishOpen();
  await opening;

  expect(terminals.tabs).toEqual([]);
  expect(fakes.pty.close).toHaveBeenCalledWith(id);
});

test('closing the active terminal activates its right neighbour, else the left one', async () => {
  await openTerminal();
  await openTerminal('cmd');
  await openTerminal('git-bash');
  const [a, b, c] = terminals.tabs.map((tab) => tab.id);
  activateTerminal(b);
  await closeTerminal(b);
  expect(terminals.activeId).toBe(c);
  await closeTerminal(c);
  expect(terminals.activeId).toBe(a);
});

test('ensureTerminal opens one terminal only when there are none', async () => {
  await ensureTerminal();
  await ensureTerminal();
  expect(terminals.tabs).toHaveLength(1);
});

test('ensureTerminal calls made at the same time open a single terminal', async () => {
  await Promise.all([ensureTerminal(), ensureTerminal()]);
  expect(terminals.tabs).toHaveLength(1);
});

test('two terminals get different ids and numbered titles', async () => {
  await openTerminal();
  await openTerminal();
  const [first, second] = terminals.tabs;
  expect(first.id).not.toBe(second.id);
  expect([first.title, second.title]).toEqual(['PowerShell', 'PowerShell (2)']);
});
