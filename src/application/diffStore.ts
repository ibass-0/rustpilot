import { createStore } from 'solid-js/store';
import { toAppError } from '../domain/fs';
import { ports } from './ports';

export interface DiffState {
  root: string | null;
  path: string | null;
  staged: boolean;
  text: string;
  loading: boolean;
  error: string | null;
}

const [state, setState] = createStore<DiffState>({ root: null, path: null, staged: false, text: '', loading: false, error: null });
export const diff: DiffState = state;
let request = 0;

export async function openDiff(root: string, path: string, staged = false): Promise<void> {
  const current = ++request;
  setState({ root, path, staged, text: '', loading: true, error: null });
  try {
    const text = await ports().git.diff(root, path, staged);
    if (current === request) setState({ text, loading: false });
  } catch (err) {
    if (current === request) setState({ loading: false, error: toAppError(err).message });
  }
}

export function closeDiff(): void {
  request++;
  setState({ root: null, path: null, staged: false, text: '', loading: false, error: null });
}
