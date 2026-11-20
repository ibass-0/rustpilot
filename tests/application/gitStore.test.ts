import { beforeEach, expect, test } from 'vitest';
import {
  checkGit,
  git,
  loadProject,
  refreshAll,
  refreshForPath,
  refreshRepository,
  removeProject,
  repositoryOfPath,
  resetGit,
  stageInRepository,
  stagePaths,
  totalChanges,
  unstageInRepository,
  unstagePaths,
} from '../../src/application/gitStore';
import { AppError } from '../../src/domain/fs';
import { emptyGitStatus, repositoryKey, type GitChange, type GitStatus, type RepositoryInfo } from '../../src/domain/git';
import type { Project } from '../../src/domain/workspace';
import { installFakePorts } from '../helpers/ports';

let fakes: ReturnType<typeof installFakePorts>;

const APP = 'C:\\work\\app';
const LIB = 'C:\\work\\app\\packages\\lib';
const TOOLS = 'D:\\tools';
const project = (root: string): Project => ({ root, name: root.split('\\').pop()! });
const repo = (root: string): RepositoryInfo => ({ root, kind: 'repository' });
const change = (path: string, staged = false): GitChange => ({ path, originalPath: null, kind: 'modified', staged });
const status = (changes: GitChange[], branch = 'main'): GitStatus => ({ ...emptyGitStatus(), isRepository: true, branch, changes });

/** Make the fake Git report these repositories per project root, and these statuses per repository root. */
function world(layout: Record<string, RepositoryInfo[]>, statuses: Record<string, GitStatus> = {}) {
  fakes.git.repositories.mockImplementation(async (root: string) => layout[root] ?? []);
  fakes.git.status.mockImplementation(async (root: string) => statuses[root] ?? status([]));
}

beforeEach(() => {
  fakes = installFakePorts();
  resetGit();
});

// ---------- availability ----------

test('a working Git is noted once', async () => {
  await checkGit();
  expect(git.available).toBe(true);
  expect(git.problem).toBeNull();
});

test('a missing or old Git is reported once and nothing is loaded', async () => {
  fakes.git.version.mockRejectedValue(new AppError('gitMissing', 'Git was not found.'));
  world({ [APP]: [repo(APP)] });
  await loadProject(project(APP));
  expect(git.available).toBe(false);
  expect(git.problem).toBe('Git was not found.');
  expect(fakes.git.repositories).not.toHaveBeenCalled();
  expect(Object.keys(git.repositories)).toEqual([]);
});

// ---------- loading ----------

test('a project with nested repositories gets a state for each', async () => {
  world({ [APP]: [repo(APP), repo(LIB)] }, { [APP]: status([change('a.ts')], 'main'), [LIB]: status([change('x.ts'), change('y.ts')], 'dev') });
  await loadProject(project(APP));
  expect(git.order).toEqual([repositoryKey(APP), repositoryKey(LIB)]);
  expect(git.repositories[repositoryKey(APP)].status.branch).toBe('main');
  expect(git.repositories[repositoryKey(LIB)].status.changes).toHaveLength(2);
  expect(totalChanges()).toBe(3);
});

test('statuses are read in parallel', async () => {
  const resolvers: Array<(s: GitStatus) => void> = [];
  fakes.git.repositories.mockResolvedValue([repo(APP), repo(LIB), repo(TOOLS)]);
  fakes.git.status.mockImplementation(() => new Promise<GitStatus>((resolve) => resolvers.push(resolve)));
  const loading = loadProject(project(APP));
  await new Promise((r) => setTimeout(r, 0));
  expect(resolvers).toHaveLength(3);
  resolvers.forEach((resolve) => resolve(status([])));
  await loading;
});

test('a project that holds no repository has none', async () => {
  world({ [APP]: [] });
  await loadProject(project(APP));
  expect(git.order).toEqual([]);
  expect(totalChanges()).toBe(0);
});

test('two projects keep their repositories apart', async () => {
  world({ [APP]: [repo(APP)], [TOOLS]: [repo(TOOLS)] }, { [APP]: status([change('a.ts')]), [TOOLS]: status([change('t.ts')], 'trunk') });
  await loadProject(project(APP));
  await loadProject(project(TOOLS));
  expect(git.order).toEqual([repositoryKey(APP), repositoryKey(TOOLS)]);
  expect(git.repositories[repositoryKey(TOOLS)].status.branch).toBe('trunk');
});

test('every repository is watched', async () => {
  world({ [APP]: [repo(APP), repo(LIB)] });
  await loadProject(project(APP));
  expect(fakes.gitEvents.watching().sort()).toEqual([APP, LIB].sort());
});

test('loading a project again does not watch its repositories twice', async () => {
  world({ [APP]: [repo(APP)] });
  await loadProject(project(APP));
  await loadProject(project(APP));
  expect(fakes.git.watch).toHaveBeenCalledTimes(1);
  expect(git.order).toEqual([repositoryKey(APP)]);
});

test('reloading drops repositories that have disappeared', async () => {
  world({ [APP]: [repo(APP), repo(LIB)] });
  await loadProject(project(APP));
  world({ [APP]: [repo(APP)] });
  await loadProject(project(APP));
  expect(git.order).toEqual([repositoryKey(APP)]);
  expect(fakes.git.unwatch).toHaveBeenCalledWith(LIB);
});

// ---------- routing ----------

test('a file is routed to the deepest repository', async () => {
  world({ [APP]: [repo(APP), repo(LIB)] });
  await loadProject(project(APP));
  expect(repositoryOfPath('C:\\work\\app\\packages\\lib\\x.ts')?.root).toBe(LIB);
  expect(repositoryOfPath('C:\\work\\app\\src\\a.ts')?.root).toBe(APP);
  expect(repositoryOfPath('E:\\elsewhere\\a.ts')).toBeNull();
});

// ---------- removing ----------

test('removing a project drops and unwatches its repositories only', async () => {
  world({ [APP]: [repo(APP)], [TOOLS]: [repo(TOOLS)] });
  await loadProject(project(APP));
  await loadProject(project(TOOLS));
  removeProject(APP);
  expect(git.order).toEqual([repositoryKey(TOOLS)]);
  expect(fakes.git.unwatch).toHaveBeenCalledWith(APP);
  expect(fakes.git.unwatch).not.toHaveBeenCalledWith(TOOLS);
});

test('a repository shared by two projects stays until both are gone', async () => {
  world({ [APP]: [repo(APP), repo(LIB)], [LIB]: [repo(LIB)] });
  await loadProject(project(APP));
  await loadProject(project(LIB));
  removeProject(APP);
  expect(git.order).toEqual([repositoryKey(LIB)]);
  expect(fakes.git.unwatch).not.toHaveBeenCalledWith(LIB);
  removeProject(LIB);
  expect(git.order).toEqual([]);
  expect(fakes.git.unwatch).toHaveBeenCalledWith(LIB);
});

// ---------- refreshing ----------

test('refreshing one repository leaves the others alone', async () => {
  world({ [APP]: [repo(APP), repo(LIB)] });
  await loadProject(project(APP));
  fakes.git.status.mockClear();
  await refreshRepository(repositoryKey(LIB));
  expect(fakes.git.status).toHaveBeenCalledTimes(1);
  expect(fakes.git.status).toHaveBeenCalledWith(LIB);
});

test('refreshing everything reads every repository', async () => {
  world({ [APP]: [repo(APP)], [TOOLS]: [repo(TOOLS)] });
  await loadProject(project(APP));
  await loadProject(project(TOOLS));
  fakes.git.status.mockClear();
  await refreshAll();
  expect(fakes.git.status).toHaveBeenCalledTimes(2);
});

test('after a save only the repository that owns the file is read again', async () => {
  world({ [APP]: [repo(APP), repo(LIB)] });
  await loadProject(project(APP));
  fakes.git.status.mockClear();
  await refreshForPath('C:\\work\\app\\packages\\lib\\x.ts');
  expect(fakes.git.status.mock.calls).toEqual([[LIB]]);
  fakes.git.status.mockClear();
  await refreshForPath('E:\\elsewhere\\a.ts');
  expect(fakes.git.status).not.toHaveBeenCalled();
});

test('a reply that arrives after a newer one is dropped', async () => {
  world({ [APP]: [repo(APP)] });
  await loadProject(project(APP));
  let finishOld!: (s: GitStatus) => void;
  fakes.git.status.mockReturnValueOnce(new Promise<GitStatus>((resolve) => (finishOld = resolve)));
  const old = refreshRepository(repositoryKey(APP));
  fakes.git.status.mockResolvedValueOnce(status([change('new.ts')], 'newer'));
  await refreshRepository(repositoryKey(APP));
  finishOld(status([change('old.ts')], 'older'));
  await old;
  expect(git.repositories[repositoryKey(APP)].status.branch).toBe('newer');
});

test('a failure marks only the repository that failed', async () => {
  world({ [APP]: [repo(APP), repo(LIB)] });
  fakes.git.status.mockImplementation(async (root: string) => {
    if (root === LIB) throw new AppError('io', 'fatal: bad object HEAD');
    return status([change('a.ts')]);
  });
  await loadProject(project(APP));
  expect(git.repositories[repositoryKey(LIB)].error).toBe('fatal: bad object HEAD');
  expect(git.repositories[repositoryKey(APP)].error).toBeNull();
  expect(git.repositories[repositoryKey(APP)].status.changes).toHaveLength(1);
});

test('a change on disk refreshes the repository that reported it', async () => {
  world({ [APP]: [repo(APP), repo(LIB)] });
  await loadProject(project(APP));
  fakes.git.status.mockClear();
  fakes.git.status.mockResolvedValue(status([change('after-commit.ts')], 'feature'));
  fakes.gitEvents.emit(LIB);
  await new Promise((r) => setTimeout(r, 0));
  expect(fakes.git.status.mock.calls).toEqual([[LIB]]);
  expect(git.repositories[repositoryKey(LIB)].status.branch).toBe('feature');
});

// ---------- stage and unstage ----------

test('staging in a repository uses paths relative to it and shows the new status', async () => {
  world({ [APP]: [repo(APP)] }, { [APP]: status([change('a.ts')]) });
  await loadProject(project(APP));
  fakes.git.stage.mockResolvedValue(status([change('a.ts', true)]));
  await stageInRepository(APP, ['a.ts']);
  expect(fakes.git.stage).toHaveBeenCalledWith(APP, ['a.ts']);
  expect(git.repositories[repositoryKey(APP)].status.changes[0].staged).toBe(true);
  expect(git.repositories[repositoryKey(APP)].busy).toBe(false);
});

test('unstaging works the same way', async () => {
  world({ [APP]: [repo(APP)] }, { [APP]: status([change('a.ts', true)]) });
  await loadProject(project(APP));
  fakes.git.unstage.mockResolvedValue(status([change('a.ts', false)]));
  await unstageInRepository(APP, ['a.ts']);
  expect(fakes.git.unstage).toHaveBeenCalledWith(APP, ['a.ts']);
  expect(git.repositories[repositoryKey(APP)].status.changes[0].staged).toBe(false);
});

test('staging paths from several repositories makes one call per repository, with relative paths', async () => {
  world({ [APP]: [repo(APP), repo(LIB)] });
  await loadProject(project(APP));
  fakes.git.stage.mockResolvedValue(status([]));
  await stagePaths(['C:\\work\\app\\src\\a.ts', 'C:\\work\\app\\packages\\lib\\x.ts', 'C:\\work\\app\\packages\\lib\\sub dir\\y.ts', 'E:\\nowhere\\z.ts']);
  const calls = fakes.git.stage.mock.calls.map(([root, paths]) => [root, paths]);
  expect(calls).toHaveLength(2);
  expect(calls).toContainEqual([APP, ['src/a.ts']]);
  expect(calls).toContainEqual([LIB, ['x.ts', 'sub dir/y.ts']]);
});

test('unstaging paths from several repositories is routed too', async () => {
  world({ [APP]: [repo(APP), repo(LIB)] });
  await loadProject(project(APP));
  fakes.git.unstage.mockResolvedValue(status([]));
  await unstagePaths(['C:\\work\\app\\packages\\lib\\x.ts']);
  expect(fakes.git.unstage.mock.calls).toEqual([[LIB, ['x.ts']]]);
});

test('a failed stage is reported on its repository and the busy flag is cleared', async () => {
  world({ [APP]: [repo(APP)] });
  await loadProject(project(APP));
  fakes.git.stage.mockRejectedValue(new AppError('io', 'fatal: Unable to create index.lock'));
  await stageInRepository(APP, ['a.ts']);
  expect(git.repositories[repositoryKey(APP)].error).toBe('fatal: Unable to create index.lock');
  expect(git.repositories[repositoryKey(APP)].busy).toBe(false);
});

test('while an operation runs, a change event waits and the repository is read once it ends', async () => {
  world({ [APP]: [repo(APP)] });
  await loadProject(project(APP));
  let finish!: (s: GitStatus) => void;
  fakes.git.stage.mockReturnValue(new Promise<GitStatus>((resolve) => (finish = resolve)));
  const staging = stageInRepository(APP, ['a.ts']);
  await new Promise((r) => setTimeout(r, 0));
  fakes.git.status.mockClear();
  fakes.gitEvents.emit(APP);
  await new Promise((r) => setTimeout(r, 0));
  expect(fakes.git.status).not.toHaveBeenCalled();
  finish(status([change('a.ts', true)]));
  await staging;
  await new Promise((r) => setTimeout(r, 0));
  expect(fakes.git.status).toHaveBeenCalledTimes(1);
});

test('resetting stops every watcher', async () => {
  world({ [APP]: [repo(APP), repo(LIB)] });
  await loadProject(project(APP));
  resetGit();
  expect(fakes.gitEvents.watching()).toEqual([]);
  expect(git.order).toEqual([]);
});
