import { createStore, reconcile } from 'solid-js/store';
import { joinPath, type LineEnding } from '../domain/fs';
import { ports } from './ports';

export interface WorkspaceSettings { autosave: boolean; excludedFolders: string[]; tabSize: number; insertSpaces: boolean }
const defaults: WorkspaceSettings = { autosave: true, excludedFolders: ['.git', 'node_modules', 'target', 'dist'], tabSize: 2, insertSpaces: true };
const [state, setState] = createStore<WorkspaceSettings>(defaults);
export const settings: WorkspaceSettings = state;
let rootPath: string | null = null;

export async function loadSettings(root: string): Promise<void> {
  rootPath = root;
  try {
    const content = await ports().fs.readTextFile(joinPath(root, '.rustpilot', 'settings.json'));
    const value = JSON.parse(content.text) as Partial<WorkspaceSettings>;
    setState(reconcile({ ...defaults, ...value, excludedFolders: Array.isArray(value.excludedFolders) ? value.excludedFolders : defaults.excludedFolders }));
  } catch { setState(reconcile(defaults)); }
}

export async function saveSettings(next: Partial<WorkspaceSettings>): Promise<void> {
  const value = { ...state, ...next };
  setState(reconcile(value));
  if (!rootPath) return;
  await ports().fs.writeTextFile(joinPath(rootPath, '.rustpilot', 'settings.json'), `${JSON.stringify(value, null, 2)}\n`, 'lf' as LineEnding);
}
