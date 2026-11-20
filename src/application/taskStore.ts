import { createStore } from 'solid-js/store';
import { joinPath } from '../domain/fs';
import { ports } from './ports';
import { workspace } from './workspaceStore';
import { runTerminalCommand } from './terminalStore';

export interface ProjectTask { name: string; command: string; cwd?: string }
const [state, setState] = createStore<{ tasks: ProjectTask[]; loading: boolean; error: string | null }>({ tasks: [], loading: false, error: null });
export const tasks = state;

export async function loadTasks(): Promise<void> {
  if (!workspace.root) return;
  setState({ loading: true, error: null });
  try {
    const content = await ports().fs.readTextFile(joinPath(workspace.root, '.rustpilot', 'tasks.json'));
    const parsed: unknown = JSON.parse(content.text);
    const entries = Array.isArray(parsed) ? parsed : (parsed as { tasks?: unknown }).tasks;
    const valid = Array.isArray(entries) ? entries.filter((task): task is ProjectTask => typeof task === 'object' && task !== null && typeof (task as ProjectTask).name === 'string' && typeof (task as ProjectTask).command === 'string') : [];
    setState({ tasks: valid, loading: false, error: null });
  } catch (err) { setState({ tasks: [], loading: false, error: String(err) }); }
}

export async function runTask(task: ProjectTask): Promise<void> { await runTerminalCommand(task.command); }
