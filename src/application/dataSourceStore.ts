import { createStore, produce } from 'solid-js/store';
import {
  isServerEngine,
  nodeKey,
  normalizeConfig,
  pathOfKey,
  validateConfig,
  type ConnectionStatus,
  type DataNode,
  type DataSourceConfig,
} from '../domain/dataSource';
import { toAppError } from '../domain/fs';
import { ports } from './ports';

const STORAGE_KEY = 'rustpilot.dataSources';

export interface DataSourceStoreState {
  sources: DataSourceConfig[];
  status: Record<string, ConnectionStatus>;
  /** The last problem per source, shown under its tree node. */
  errors: Record<string, string>;
  /** Loaded children per source, keyed by `nodeKey(path)`; the root is the empty key. */
  children: Record<string, Record<string, DataNode[]>>;
  expanded: Record<string, Record<string, boolean>>;
  loading: Record<string, Record<string, boolean>>;
  selected: { id: string; path: string[] } | null;
  /** Set while the user is asked for the password of a server; answer with `answerPassword`. */
  passwordRequest: { id: string; name: string } | null;
}

const emptyState = (): DataSourceStoreState => ({
  sources: [],
  status: {},
  errors: {},
  children: {},
  expanded: {},
  loading: {},
  selected: null,
  passwordRequest: null,
});

const [state, setState] = createStore<DataSourceStoreState>(emptyState());

/** Read-only view of the saved connections and their live state. */
export const dataSources: DataSourceStoreState = state;

/**
 * Bumped whenever a source disconnects or reloads, so a slow reply that
 * belongs to an older tree can be recognised and dropped.
 */
const generations = new Map<string, number>();
/** Read fresh each call, so a check after an `await` is not narrowed by an earlier one. */
export const isConnected = (id: string): boolean => state.status[id] === 'connected';
const generationOf = (id: string): number => generations.get(id) ?? 0;
const bump = (id: string): number => {
  const next = generationOf(id) + 1;
  generations.set(id, next);
  return next;
};

function persist(): void {
  ports().storage.set(STORAGE_KEY, JSON.stringify(state.sources));
}

let passwordResolver: ((password: string | null) => void) | null = null;
/** Password prompts are shown one after another, never on top of each other. */
let passwordQueue: Promise<unknown> = Promise.resolve();

function askPassword(config: DataSourceConfig): Promise<string | null> {
  const prompt = () =>
    new Promise<string | null>((resolve) => {
      passwordResolver = resolve;
      setState('passwordRequest', { id: config.id, name: config.name });
    });
  const answer = passwordQueue.then(prompt);
  passwordQueue = answer.then(
    () => undefined,
    () => undefined,
  );
  return answer;
}

/** Answer the open password prompt. `null` means the user cancelled. */
export function answerPassword(password: string | null): void {
  const resolve = passwordResolver;
  passwordResolver = null;
  setState('passwordRequest', null);
  resolve?.(password);
}

/** Forget everything, including saved connections in memory. Used by tests. */
export function resetDataSources(): void {
  answerPassword(null);
  passwordQueue = Promise.resolve();
  generations.clear();
  setState(emptyState());
}

export function loadSources(): void {
  let sources: DataSourceConfig[] = [];
  try {
    const value: unknown = JSON.parse(ports().storage.get(STORAGE_KEY) ?? '[]');
    if (Array.isArray(value)) sources = value.map(normalizeConfig).filter((c): c is DataSourceConfig => c !== null);
  } catch {
    sources = [];
  }
  setState({
    ...emptyState(),
    sources,
    status: Object.fromEntries(sources.map((s) => [s.id, 'disconnected' as const])),
  });
}

/**
 * Add a source or replace the one with the same id. A connected source is disconnected, since its
 * settings changed. `password` is kept in the Credential Manager when the config says to save it; an
 * empty one leaves a saved password as it is. Rejects, saving nothing, when the credential store fails.
 */
export async function saveSource(config: DataSourceConfig, password?: string): Promise<void> {
  const previous = state.sources.find((s) => s.id === config.id);
  const keepsPassword = isServerEngine(config.engine) && config.savePassword;
  if (keepsPassword && password) await ports().dataSource.saveSecret(config.id, password);
  else if (!keepsPassword && previous && isServerEngine(previous.engine) && previous.savePassword) {
    await ports().dataSource.forgetSecret(config.id);
  }
  if (previous && state.status[config.id] === 'connected') await disconnectSource(config.id);
  setState(
    produce((s) => {
      const index = s.sources.findIndex((item) => item.id === config.id);
      if (index === -1) s.sources.push(config);
      else s.sources[index] = config;
      if (!s.status[config.id]) s.status[config.id] = 'disconnected';
    }),
  );
  persist();
}

export async function removeSource(id: string): Promise<void> {
  const config = state.sources.find((s) => s.id === id);
  if (state.status[id] === 'connected' || state.status[id] === 'connecting') await disconnectSource(id);
  if (config && isServerEngine(config.engine) && config.savePassword) {
    try {
      await ports().dataSource.forgetSecret(id);
    } catch {
      // The connection is removed anyway; a leftover credential is harmless and can be deleted in Windows.
    }
  }
  setState(
    produce((s) => {
      s.sources = s.sources.filter((item) => item.id !== id);
      delete s.status[id];
      delete s.errors[id];
      if (s.selected?.id === id) s.selected = null;
    }),
  );
  generations.delete(id);
  persist();
}

export async function connectSource(id: string): Promise<void> {
  const config = state.sources.find((s) => s.id === id);
  if (!config || state.status[id] === 'connecting') return;
  const generation = bump(id);
  setState(
    produce((s) => {
      s.status[id] = 'connecting';
      delete s.errors[id];
    }),
  );
  try {
    let password: string | undefined;
    if (isServerEngine(config.engine) && !config.savePassword) {
      const answer = await askPassword(config);
      if (generationOf(id) !== generation) return;
      if (answer === null) {
        setState('status', id, 'disconnected');
        return;
      }
      password = answer;
    }
    // A saved password is read by the backend, so none is sent.
    if (password === undefined) await ports().dataSource.connect(config);
    else await ports().dataSource.connect(config, password);
    if (generationOf(id) !== generation) return;
    setState('status', id, 'connected');
  } catch (err) {
    if (generationOf(id) !== generation) return;
    setState(
      produce((s) => {
        s.status[id] = 'error';
        s.errors[id] = toAppError(err).message;
      }),
    );
  }
}

function clearTree(id: string): void {
  setState(
    produce((s) => {
      delete s.children[id];
      delete s.expanded[id];
      delete s.loading[id];
      if (s.selected?.id === id) s.selected = null;
    }),
  );
}

export async function disconnectSource(id: string): Promise<void> {
  bump(id);
  clearTree(id);
  setState(
    produce((s) => {
      if (s.status[id]) s.status[id] = 'disconnected';
      delete s.errors[id];
    }),
  );
  try {
    await ports().dataSource.disconnect(id);
  } catch (err) {
    setState('errors', id, toAppError(err).message);
  }
}

/** Fetch the children of `path`. Resolves to `false` when the load failed or was superseded. */
async function loadChildren(id: string, path: string[]): Promise<boolean> {
  const key = nodeKey(path);
  const generation = generationOf(id);
  setState(
    produce((s) => {
      (s.loading[id] ??= {})[key] = true;
    }),
  );
  try {
    const nodes = await ports().dataSource.children(id, path);
    if (generationOf(id) !== generation) return false;
    setState(
      produce((s) => {
        (s.children[id] ??= {})[key] = nodes;
        s.loading[id][key] = false;
      }),
    );
    return true;
  } catch (err) {
    if (generationOf(id) !== generation) return false;
    setState(
      produce((s) => {
        s.loading[id][key] = false;
        s.errors[id] = toAppError(err).message;
      }),
    );
    return false;
  }
}

/** Open or close a tree node. The root path is `[]`. Opening a disconnected source connects it first. */
export async function toggleNode(id: string, path: string[]): Promise<void> {
  const key = nodeKey(path);
  if (state.expanded[id]?.[key]) {
    setState(
      produce((s) => {
        s.expanded[id][key] = false;
      }),
    );
    return;
  }
  if (!isConnected(id)) {
    await connectSource(id);
    if (!isConnected(id)) return;
  }
  const generation = generationOf(id);
  const cached = state.children[id]?.[key] !== undefined;
  if (!cached && !(await loadChildren(id, path))) {
    if (generationOf(id) === generation) {
      setState(
        produce((s) => {
          (s.expanded[id] ??= {})[key] = false;
        }),
      );
    }
    return;
  }
  setState(
    produce((s) => {
      (s.expanded[id] ??= {})[key] = true;
    }),
  );
}

/** Drop what was loaded and read the open nodes again. */
export async function refreshSource(id: string): Promise<void> {
  if (state.status[id] !== 'connected') return;
  const open = Object.entries(state.expanded[id] ?? {})
    .filter(([, isOpen]) => isOpen)
    .map(([key]) => pathOfKey(key))
    .sort((a, b) => a.length - b.length);
  bump(id);
  setState(
    produce((s) => {
      delete s.children[id];
      delete s.loading[id];
      delete s.errors[id];
    }),
  );
  for (const path of open) {
    if (!(await loadChildren(id, path))) {
      setState(
        produce((s) => {
          s.expanded[id][nodeKey(path)] = false;
        }),
      );
    }
  }
}

export function selectNode(id: string, path: string[]): void {
  setState('selected', { id, path });
}

/** Table names mapped to their column names, for autocomplete. Only what has been loaded is listed. */
export function tablesOf(id: string): Record<string, string[]> {
  const loaded = state.children[id] ?? {};
  const tables: Record<string, string[]> = {};
  for (const nodes of Object.values(loaded)) {
    for (const node of nodes) {
      if (node.kind !== 'table' && node.kind !== 'view') continue;
      const [schema, , table] = node.path;
      const columns = loaded[nodeKey(node.path)] ?? [];
      tables[`${schema}.${table}`] = columns.map((column) => column.label);
    }
  }
  return tables;
}

/** Try a form without saving it. Never rejects; the message is ready to show under the form. */
export async function testSource(config: DataSourceConfig, password?: string): Promise<{ ok: boolean; message: string }> {
  const problem = validateConfig(config);
  if (problem) return { ok: false, message: problem };
  try {
    if (password === undefined) await ports().dataSource.test(config);
    else await ports().dataSource.test(config, password);
    return { ok: true, message: 'Connection succeeded.' };
  } catch (err) {
    return { ok: false, message: toAppError(err).message };
  }
}

/** Resolves to `null` when the picker is cancelled. */
export function pickDatabaseFile(): Promise<string | null> {
  return ports().dialog.pickFile([
    { name: 'SQLite database', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] },
    { name: 'All files', extensions: ['*'] },
  ]);
}

/** Delete after the user agrees. Only the saved connection goes; the database file is untouched. */
export async function removeSourceConfirmed(id: string): Promise<void> {
  const config = state.sources.find((s) => s.id === id);
  if (!config) return;
  const agreed = await ports().dialog.confirm(`Remove the data source "${config.name}"? The database itself is not changed.`);
  if (agreed) await removeSource(id);
}

/** An id that is safe to use in a file name. */
export function newSourceId(): string {
  return crypto.randomUUID();
}
