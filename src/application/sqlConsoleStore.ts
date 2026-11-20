import { createStore } from 'solid-js/store';
import { toAppError } from '../domain/fs';
import { previewQuery, splitStatements, statementAt, type SqlResult } from '../domain/sql';
import { connectSource, dataSources, isConnected } from './dataSourceStore';
import { markDirty, openFile } from './editorStore';
import { ports } from './ports';

const STORAGE_KEY = 'rustpilot.sqlAttachments';
const HEIGHT_KEY = 'rustpilot.sqlResultHeight';
const DEFAULT_RESULT_HEIGHT = 240;
const MIN_RESULT_HEIGHT = 80;
const MAX_RESULT_HEIGHT = 800;

export interface SqlRunOutcome {
  result: SqlResult | null;
  error: string | null;
  /** The statement the outcome belongs to. */
  sql: string;
}

export interface SqlConsoleState {
  /** File path to the id of the connection its statements run on. */
  attached: Record<string, string>;
  /** `executionId` is 0 while the connection is still being opened. */
  running: { path: string; executionId: number; sql: string } | null;
  results: Record<string, SqlRunOutcome>;
  /** Height of the result panel under the editor, in pixels. */
  resultHeight: number;
}

const [state, setState] = createStore<SqlConsoleState>({
  attached: {},
  running: null,
  results: {},
  resultHeight: DEFAULT_RESULT_HEIGHT,
});

/** Read-only view of which files run on which connection, and what came back. */
export const sqlConsole: SqlConsoleState = state;

/** Bumped by every run, so replies that belong to an older run can be recognised and dropped. */
let token = 0;
let nextExecutionId = 1;
let stopRequested = false;

/** Forget everything in memory. Used by tests. */
export function resetSqlConsole(): void {
  token++;
  stopRequested = false;
  setState({ attached: {}, running: null, results: {}, resultHeight: DEFAULT_RESULT_HEIGHT });
}

export function loadConsoles(): void {
  let attached: Record<string, string> = {};
  try {
    const value: unknown = JSON.parse(ports().storage.get(STORAGE_KEY) ?? '{}');
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      attached = Object.fromEntries(Object.entries(value).filter(([, id]) => typeof id === 'string')) as Record<string, string>;
    }
  } catch {
    attached = {};
  }
  setState('attached', attached);
  const height = Number(ports().storage.get(HEIGHT_KEY));
  if (Number.isFinite(height) && height > 0) setState('resultHeight', clampHeight(height));
}

const clampHeight = (px: number): number => Math.min(MAX_RESULT_HEIGHT, Math.max(MIN_RESULT_HEIGHT, Math.round(px)));

export function setResultHeight(px: number): void {
  const height = clampHeight(px);
  setState('resultHeight', height);
  ports().storage.set(HEIGHT_KEY, String(height));
}

export const attachedSource = (path: string): string | null => state.attached[path] ?? null;

/** Run the statements of `path` on connection `sourceId`; `null` detaches the file. */
export function attach(path: string, sourceId: string | null): void {
  const next = { ...state.attached };
  if (sourceId === null) delete next[path];
  else next[path] = sourceId;
  setState('attached', () => next);
  ports().storage.set(STORAGE_KEY, JSON.stringify(next));
}

/** Open the console file of a connection and attach the connection to it. */
export async function openConsole(sourceId: string): Promise<void> {
  const path = await ports().dataSource.consolePath(sourceId);
  await openFile(path);
  attach(path, sourceId);
}

const setOutcome = (path: string, outcome: SqlRunOutcome): void => setState('results', path, outcome);

async function run(path: string, statements: string[]): Promise<void> {
  const sourceId = state.attached[path];
  if (!sourceId) {
    setOutcome(path, { result: null, error: 'Choose a connection for this file.', sql: '' });
    return;
  }
  if (statements.length === 0) return;
  if (state.running) await stop();

  const mine = ++token;
  stopRequested = false;
  setState('running', { path, executionId: 0, sql: statements[0] });
  try {
    if (!isConnected(sourceId)) {
      await connectSource(sourceId);
      if (mine !== token) return;
      if (!isConnected(sourceId)) {
        setOutcome(path, { result: null, error: dataSources.errors[sourceId] ?? 'Could not connect.', sql: statements[0] });
        return;
      }
    }
    let shown: SqlResult | null = null;
    let last: SqlResult | null = null;
    for (const sql of statements) {
      if (mine !== token) return;
      if (stopRequested) {
        setOutcome(path, { result: null, error: 'Cancelled.', sql });
        return;
      }
      const executionId = nextExecutionId++;
      setState('running', { path, executionId, sql });
      try {
        const result = await ports().dataSource.execute(sourceId, executionId, sql);
        if (mine !== token) return;
        last = result;
        if (result.columns.length > 0) shown = result;
      } catch (err) {
        if (mine !== token) return;
        const failure = toAppError(err);
        setOutcome(path, { result: null, error: failure.kind === 'cancelled' ? 'Cancelled.' : failure.message, sql });
        return;
      }
    }
    setOutcome(path, { result: shown ?? last, error: null, sql: statements[statements.length - 1] });
  } finally {
    if (mine === token) setState('running', null);
  }
}

export const isSqlFile = (path: string): boolean => path.toLowerCase().endsWith('.sql');

/** Run the open buffer of `path`: the whole file, or the selection / statement under the cursor. */
export async function runFile(path: string, all = false): Promise<void> {
  if (!ports().buffers.has(path)) return;
  const text = ports().buffers.text(path);
  if (all) return runAll(path, text);
  const selection = ports().buffers.selection(path) ?? { from: 0, to: 0 };
  return runAtCursor(path, text, selection.from, selection.to);
}

/** Run the selection, or the statement under the cursor when nothing is selected. */
export async function runAtCursor(path: string, text: string, from: number, to: number): Promise<void> {
  if (from !== to) {
    const selected = text.slice(Math.min(from, to), Math.max(from, to));
    return run(path, splitStatements(selected).map((s) => s.text));
  }
  const statement = statementAt(text, from);
  return run(path, statement ? [statement.text] : []);
}

export function runAll(path: string, text: string): Promise<void> {
  return run(path, splitStatements(text).map((s) => s.text));
}

/** Cancel the running statement, if any. */
export async function stop(): Promise<void> {
  const running = state.running;
  if (!running) return;
  stopRequested = true;
  if (running.executionId === 0) {
    // Still connecting: nothing to cancel on the backend, so abandon the run.
    token++;
    setState('running', null);
    return;
  }
  try {
    await ports().dataSource.cancel(running.executionId);
  } catch {
    // The statement may have finished a moment ago; its own outcome is what counts.
  }
}

/** Open the console of a connection with a query that reads the first rows of a table, and run it. */
export async function openTablePreview(sourceId: string, schema: string, table: string): Promise<void> {
  const config = dataSources.sources.find((s) => s.id === sourceId);
  if (!config) return;
  const path = await ports().dataSource.consolePath(sourceId);
  await openFile(path);
  if (!ports().buffers.has(path)) return;
  attach(path, sourceId);
  const query = previewQuery(config.engine, schema, table);
  ports().buffers.append(path, query);
  markDirty(path);
  await run(path, [query]);
}
