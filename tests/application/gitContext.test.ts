import { beforeEach, expect, test } from 'vitest';
import { activateTab, closeTab, editor, openFile } from '../../src/application/editorStore';
import { activeRepository, pinRepository } from '../../src/application/gitContext';
import { loadProject, resetGit } from '../../src/application/gitStore';
import { repositoryKey } from '../../src/domain/git';
import { installFakePorts } from '../helpers/ports';

let fakes: ReturnType<typeof installFakePorts>;
const APP = 'C:\\work\\app';
const LIB = 'C:\\work\\app\\packages\\lib';
const TOOLS = 'D:\\tools';

beforeEach(async () => {
  installFakePorts();
  for (const tab of [...editor.tabs]) await closeTab(tab.path);
  fakes = installFakePorts();
  resetGit();
  fakes.git.repositories.mockImplementation(async (root: string) =>
    root === APP
      ? [
          { root: APP, kind: 'repository' },
          { root: LIB, kind: 'repository' },
        ]
      : [{ root, kind: 'repository' }],
  );
});

test('with nothing open there is no active repository before any is loaded', () => {
  expect(activeRepository()).toBeNull();
});

test('with no file open the first repository is active', async () => {
  await loadProject({ root: APP, name: 'app' });
  expect(activeRepository()?.root).toBe(APP);
});

test('the active repository follows the file in the active tab', async () => {
  await loadProject({ root: APP, name: 'app' });
  await loadProject({ root: TOOLS, name: 'tools' });
  await openFile(`${LIB}\\src\\a.ts`);
  expect(activeRepository()?.root).toBe(LIB);
  await openFile(`${TOOLS}\\run.ps1`);
  expect(activeRepository()?.root).toBe(TOOLS);
  activateTab(`${LIB}\\src\\a.ts`);
  expect(activeRepository()?.root).toBe(LIB);
});

test('a file outside every repository falls back to the first one', async () => {
  await loadProject({ root: APP, name: 'app' });
  await openFile('E:\\notes\\todo.txt');
  expect(activeRepository()?.root).toBe(APP);
});

test('a pinned repository stays active while the same tab is open, and gives way when the tab changes', async () => {
  await loadProject({ root: APP, name: 'app' });
  await loadProject({ root: TOOLS, name: 'tools' });
  await openFile(`${APP}\\a.ts`);
  pinRepository(repositoryKey(TOOLS));
  expect(activeRepository()?.root).toBe(TOOLS);
  await openFile(`${APP}\\b.ts`);
  expect(activeRepository()?.root).toBe(APP);
});

test('pinning a repository that does not exist changes nothing', async () => {
  await loadProject({ root: APP, name: 'app' });
  pinRepository('nope');
  expect(activeRepository()?.root).toBe(APP);
});
