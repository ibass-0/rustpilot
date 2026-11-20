/** A folder in the workspace. A workspace holds one or more of them. */
export interface Project {
  root: string;
  name: string;
}

/** Forward slashes and no trailing one: `C:\work\app\` becomes `C:/work/app`. */
export function normalizePath(path: string): string {
  const slashed = path.replace(/\\/g, '/');
  return slashed.length > 1 ? slashed.replace(/\/+$/, '') : slashed;
}

/** What two spellings of the same Windows path have in common. */
export function comparablePath(path: string): string {
  return normalizePath(path).toLowerCase();
}

export function samePath(a: string, b: string): boolean {
  return comparablePath(a) === comparablePath(b);
}

/** Whether `path` is `root` or lies below it. `C:\ab` is not inside `C:\a`. */
export function isInside(path: string, root: string): boolean {
  const p = comparablePath(path);
  const r = comparablePath(root);
  return p === r || p.startsWith(`${r}/`);
}

/** The last folder of a path. */
export function projectName(root: string): string {
  const normalized = normalizePath(root);
  return normalized.slice(normalized.lastIndexOf('/') + 1) || normalized;
}

/** The innermost project that contains `path`, or `null`. */
export function projectFor(projects: readonly Project[], path: string): Project | null {
  let best: Project | null = null;
  for (const project of projects) {
    if (isInside(path, project.root) && (best === null || comparablePath(project.root).length > comparablePath(best.root).length)) {
      best = project;
    }
  }
  return best;
}

/** Add a folder to the list. A folder that is already there, however it is spelled, is not added again. */
export function addProject(projects: readonly Project[], root: string): Project[] {
  if (projects.some((p) => samePath(p.root, root))) return [...projects];
  return [...projects, { root, name: projectName(root) }];
}

/**
 * Read the saved project list. A workspace saved by an older version is a single folder,
 * which becomes the only project. Damaged data gives an empty list.
 */
export function parseStoredProjects(raw: string | null, legacyRoot: string | null): Project[] {
  if (raw !== null) {
    try {
      const value: unknown = JSON.parse(raw);
      if (Array.isArray(value)) {
        return value.reduce<Project[]>((projects, item) => {
          const root = typeof item === 'object' && item !== null ? (item as { root?: unknown }).root : undefined;
          return typeof root === 'string' && root !== '' ? addProject(projects, root) : projects;
        }, []);
      }
    } catch {
      return [];
    }
    return [];
  }
  return legacyRoot ? addProject([], legacyRoot) : [];
}
