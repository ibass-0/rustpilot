import { createStore, reconcile } from 'solid-js/store';
import { ports } from './ports';

const FILES_KEY = 'rustpilot.recent.files.v1';
const PROJECTS_KEY = 'rustpilot.recent.projects.v1';
const LIMIT = 20;

interface RecentState { files: string[]; projects: string[] }
const read = (key: string): string[] => {
  try {
    const value: unknown = JSON.parse(ports().storage.get(key) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch { return []; }
};
const [state, setState] = createStore<RecentState>({ files: [], projects: [] });
export const recent: RecentState = state;

export function loadRecent(): void {
  setState(reconcile({ files: read(FILES_KEY), projects: read(PROJECTS_KEY) }));
}

function remember(key: string, field: 'files' | 'projects', path: string): void {
  if (!path) return;
  const values = [path, ...state[field].filter((item) => item !== path)].slice(0, LIMIT);
  setState(field, values);
  ports().storage.set(key, JSON.stringify(values));
}

export const rememberFile = (path: string): void => remember(FILES_KEY, 'files', path);
export const rememberProject = (path: string): void => remember(PROJECTS_KEY, 'projects', path);

export function removeRecentFile(path: string): void {
  const files = state.files.filter((item) => item !== path);
  setState('files', files);
  ports().storage.set(FILES_KEY, JSON.stringify(files));
}
