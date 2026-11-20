import { createStore } from 'solid-js/store';
import { ports } from './ports';
import { workspace } from './workspaceStore';
import type { DirEntry } from '../domain/fs';

interface QuickOpenState { loading: boolean; files: string[]; error: string | null }
const [state, setState] = createStore<QuickOpenState>({ loading: false, files: [], error: null });
export const quickOpen: QuickOpenState = state;
let request = 0;
const SKIP = new Set(['.git', 'node_modules', 'target', 'dist']);

export async function indexWorkspace(): Promise<void> {
  const root = workspace.root;
  if (!root) { setState({ loading: false, files: [], error: null }); return; }
  const current = ++request;
  setState({ loading: true, error: null });
  const files: string[] = [];
  const visit = async (path: string): Promise<void> => {
    const entries = await ports().fs.listDir(path);
    await Promise.all(entries.map(async (entry: DirEntry) => {
      if (entry.isDir) {
        if (!SKIP.has(entry.name)) await visit(entry.path);
      } else files.push(entry.path);
    }));
  };
  try {
    await visit(root);
    if (current === request) setState({ loading: false, files: files.sort(), error: null });
  } catch (err) {
    if (current === request) setState({ loading: false, error: String(err) });
  }
}
