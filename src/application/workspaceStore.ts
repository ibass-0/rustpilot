import { batch } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import { toAppError, type DirEntry } from '../domain/fs';
import { addProject, isInside, parseStoredProjects, samePath, type Project } from '../domain/workspace';
import { loadProject, refreshAll, removeProject, resetGit } from './gitStore';
import { rememberProject } from './recentStore';
import { loadSettings } from './workspaceSettingsStore';
import { ports } from './ports';

export interface WorkspaceState {
  /** The folders of the workspace, in the order they were added. */
  projects: Project[];
  /**
   * The first project's folder, or `null` when the workspace is empty. Features that work on a single
   * folder (search, quick open, tasks, the terminal) use it until they learn about several projects.
   */
  root: string | null;
  /** Loaded directory listings, keyed by directory path. */
  children: Record<string, DirEntry[]>;
  expanded: Record<string, boolean>;
}

const STORAGE_KEY = 'rustpilot.workspace.v2';
/** Saved by versions that only knew one folder. */
const LEGACY_STORAGE_KEY = 'rustpilot.workspace.v1';

const emptyState = (): WorkspaceState => ({ projects: [], root: null, children: {}, expanded: {} });

const [state, setState] = createStore<WorkspaceState>(emptyState());

/** Read-only view of the open workspace. */
export const workspace: WorkspaceState = state;

/** The first project's folder, for features that have not learned about several projects yet. */
export const primaryRoot = (): string | null => state.root;

/** Counts open requests so that only the most recent one takes effect. */
let openRequest = 0;

function persist(): void {
  if (state.projects.length === 0) ports().storage.remove(STORAGE_KEY);
  else ports().storage.set(STORAGE_KEY, JSON.stringify(state.projects));
  ports().storage.remove(LEGACY_STORAGE_KEY);
}

/**
 * Open `path` as the only project of the workspace, replacing whatever was open. Rejects, leaving
 * the current workspace untouched, if it cannot be listed. When several opens overlap, the one
 * requested last wins no matter which listing finishes first.
 */
export async function openWorkspace(path: string): Promise<void> {
  const request = ++openRequest;
  const entries = await ports().fs.listDir(path);
  if (request !== openRequest) return;
  const previous = state.projects.map((p) => p.root);
  const projects = addProject([], path);
  batch(() => {
    setState(reconcile({ projects, root: path, children: { [path]: entries }, expanded: {} }));
  });
  for (const root of previous) removeProject(root);
  persist();
  rememberProject(path);
  await loadProject(projects[0]);
  await loadSettings(path);
}

/** Add a folder to the workspace. Rejects, adding nothing, if it cannot be listed. A folder already there is left alone. */
export async function addFolderToWorkspace(path: string): Promise<void> {
  if (state.projects.some((p) => samePath(p.root, path))) return;
  const entries = await ports().fs.listDir(path);
  if (state.projects.some((p) => samePath(p.root, path))) return;
  const projects = addProject(state.projects, path);
  const project = projects[projects.length - 1];
  batch(() => {
    setState('projects', projects);
    setState('children', path, entries);
    if (state.root === null) setState('root', path);
  });
  persist();
  rememberProject(path);
  await loadProject(project);
  if (projects.length === 1) await loadSettings(path);
}

/** Take a folder out of the workspace. Its listings and repositories go with it. */
export function removeFromWorkspace(root: string): void {
  if (!state.projects.some((p) => samePath(p.root, root))) return;
  const remaining = state.projects.filter((p) => !samePath(p.root, root));
  batch(() => {
    setState(
      produce((s) => {
        s.projects = remaining;
        s.root = remaining[0]?.root ?? null;
        for (const key of Object.keys(s.children)) if (isInside(key, root)) delete s.children[key];
        for (const key of Object.keys(s.expanded)) if (isInside(key, root)) delete s.expanded[key];
      }),
    );
  });
  removeProject(root);
  persist();
}

export function closeWorkspace(): void {
  openRequest++;
  resetGit();
  setState(reconcile(emptyState()));
  persist();
}

/**
 * Expand or collapse a directory. Its children are read again on every
 * expand, so files created outside the app show up.
 */
export async function toggleDir(path: string): Promise<void> {
  if (state.expanded[path]) {
    setState('expanded', path, false);
    return;
  }
  try {
    const entries = await ports().fs.listDir(path);
    setState('children', path, entries);
  } catch (err) {
    await ports().dialog.showError(toAppError(err).message);
    return;
  }
  setState('expanded', path, true);
}

/** Collapse every directory in the tree. */
export function collapseAll(): void {
  setState('expanded', reconcile({}));
}

export async function refreshDir(path: string): Promise<void> {
  try {
    const entries = await ports().fs.listDir(path);
    setState('children', path, entries);
  } catch (err) {
    await ports().dialog.showError(toAppError(err).message);
  }
}

/**
 * Re-read every project root and every expanded directory, quietly, then the Git status of every
 * repository. A directory that can no longer be listed is collapsed and forgotten rather than reported.
 */
export async function refreshWorkspace(): Promise<void> {
  if (state.projects.length === 0) return;
  const roots = state.projects.map((p) => p.root);
  const request = openRequest;
  const paths = [...roots, ...Object.keys(state.expanded).filter((path) => state.expanded[path])];
  const [listings] = await Promise.all([
    Promise.all(
      paths.map((path) =>
        ports()
          .fs.listDir(path)
          .then(
            (entries) => ({ path, entries }),
            () => ({ path, entries: null }),
          ),
      ),
    ),
    refreshAll(),
  ]);
  // The workspace was switched while the listings were in flight.
  if (request !== openRequest) return;

  batch(() => {
    for (const { path, entries } of listings) {
      if (entries) {
        setState('children', path, reconcile(entries, { key: 'path' }));
      } else if (!roots.includes(path)) {
        setState('expanded', path, false);
        setState('children', path, undefined!);
      }
    }
  });
}

/** Find the repositories of every project again, for when a repository was created or removed. */
export async function rediscoverRepositories(): Promise<void> {
  await Promise.all(state.projects.map((project) => loadProject(project)));
}

/** Reopen the last workspace. A project whose folder no longer opens is forgotten silently. */
export async function restoreWorkspace(): Promise<void> {
  const projects = parseStoredProjects(ports().storage.get(STORAGE_KEY), ports().storage.get(LEGACY_STORAGE_KEY));
  if (projects.length === 0) return;
  const request = openRequest + 1;
  openRequest = request;
  const listings = await Promise.all(
    projects.map((project) =>
      ports()
        .fs.listDir(project.root)
        .then(
          (entries) => ({ project, entries }),
          () => null,
        ),
    ),
  );
  // Something else was opened while the folders were being read.
  if (request !== openRequest) return;
  const alive = listings.filter((listing): listing is NonNullable<typeof listing> => listing !== null);
  if (alive.length === 0) {
    closeWorkspace();
    return;
  }
  batch(() => {
    setState(
      reconcile({
        projects: alive.map((l) => l.project),
        root: alive[0].project.root,
        children: Object.fromEntries(alive.map((l) => [l.project.root, l.entries])),
        expanded: {},
      }),
    );
  });
  persist();
  await Promise.all(alive.map((l) => loadProject(l.project)));
  await loadSettings(alive[0].project.root);
}

export async function pickAndOpenWorkspace(): Promise<void> {
  const picked = await ports().dialog.pickFolder();
  if (picked === null) return;
  try {
    await openWorkspace(picked);
  } catch (err) {
    await ports().dialog.showError(toAppError(err).message);
  }
}

export async function pickAndAddFolder(): Promise<void> {
  const picked = await ports().dialog.pickFolder();
  if (picked === null) return;
  try {
    await addFolderToWorkspace(picked);
  } catch (err) {
    await ports().dialog.showError(toAppError(err).message);
  }
}
