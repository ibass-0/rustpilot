import { createSignal, For, onMount, Show, type JSX } from 'solid-js';
import { workspace } from '../../application/workspaceStore';
import { call } from '../../infrastructure/tauri/invoke';

interface Commit { hash: string; subject: string; author: string; timestamp: number; refs: Array<{ name: string; current: boolean }>; graph?: { column: number; color: number } | null; }
interface Page { commits: Commit[]; hasMore: boolean; }

export function GitGraphPanel(): JSX.Element {
  const [commits, setCommits] = createSignal<Commit[]>([]); const [loading, setLoading] = createSignal(false); const [error, setError] = createSignal<string | null>(null); const [selected, setSelected] = createSignal<Commit | null>(null);
  const load = async () => { if (!workspace.root) return; setLoading(true); setError(null); try { const page = await call<Page>('git_log', { root: workspace.root, request: { limit: 100, skip: 0, scope: { type: 'all' }, laneState: [] } }); setCommits(page.commits); } catch (e) { setError(String(e)); } finally { setLoading(false); } };
  onMount(() => void load());
  return <div class="git-graph-panel"><header class="git-graph-toolbar"><strong>Git Graph</strong><button type="button" class="icon-button" onClick={() => void load()}>Refresh</button></header><Show when={workspace.root} fallback={<div class="empty-state">Open a workspace to view history.</div>}><Show when={!loading()} fallback={<div class="empty-state">Loading history...</div>}><Show when={!error()} fallback={<div class="empty-state">{error()}</div>}><div class="git-graph-list"><For each={commits()}>{(commit) => <button type="button" class="git-graph-row" onClick={() => setSelected(commit)}><span class="git-graph-lane" style={{ color: `hsl(${(commit.graph?.color ?? 0) * 47 % 360} 70% 60%)` }}>●</span><span class="git-graph-subject">{commit.subject}<small>{commit.refs.map((ref) => ref.name).join(' ')}</small></span><span class="git-graph-author">{commit.author}</span><time>{new Date(commit.timestamp * 1000).toLocaleDateString()}</time><code>{commit.hash.slice(0, 7)}</code></button>}</For></div><Show when={selected()}>{(commit) => <aside class="git-graph-detail"><strong>{commit().subject}</strong><span>{commit().author} · {new Date(commit().timestamp * 1000).toLocaleString()}</span><code>{commit().hash}</code></aside>}</Show></Show></Show></Show></div>;
}
