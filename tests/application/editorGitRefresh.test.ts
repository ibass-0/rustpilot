import { beforeEach, expect, test } from 'vitest';
import { closeTab, editor, markDirty, openFile, saveTab } from '../../src/application/editorStore';
import { loadProject, resetGit } from '../../src/application/gitStore';
import { installFakePorts } from '../helpers/ports';

let fakes: ReturnType<typeof installFakePorts>;
const APP = 'C:\\work\\app';
const LIB = 'C:\\work\\app\\packages\\lib';

beforeEach(async () => {
  installFakePorts();
  for (const tab of [...editor.tabs]) await closeTab(tab.path);
  fakes = installFakePorts();
  resetGit();
  fakes.git.repositories.mockResolvedValue([
    { root: APP, kind: 'repository' },
    { root: LIB, kind: 'repository' },
  ]);
  await loadProject({ root: APP, name: 'app' });
  fakes.git.status.mockClear();
});

const edit = async (path: string) => {
  await openFile(path);
  fakes.buffers.append(path, 'x');
  markDirty(path);
};

test('saving a file reads only the repository that owns it', async () => {
  const path = `${LIB}\\src\\a.ts`;
  await edit(path);
  await saveTab(path);
  await new Promise((r) => setTimeout(r, 0));
  expect(fakes.git.status.mock.calls).toEqual([[LIB]]);
});

test('saving a clean file reads nothing', async () => {
  const path = `${APP}\\clean.ts`;
  await openFile(path);
  await saveTab(path);
  await new Promise((r) => setTimeout(r, 0));
  expect(fakes.git.status).not.toHaveBeenCalled();
});

test('a failed save does not touch Git', async () => {
  const path = `${APP}\\broken.ts`;
  await edit(path);
  fakes.fs.writeTextFile.mockRejectedValueOnce(new Error('disk full'));
  await saveTab(path);
  await new Promise((r) => setTimeout(r, 0));
  expect(fakes.git.status).not.toHaveBeenCalled();
});
