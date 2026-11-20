import { createStore } from 'solid-js/store';
import type { DockerContainer, DockerImage, DockerInfo } from '../domain/docker';
import { ports } from './ports';

interface DockerState { connected: boolean; loading: boolean; error: string | null; info: DockerInfo | null; containers: DockerContainer[]; images: DockerImage[]; }
const [state, setState] = createStore<DockerState>({ connected: false, loading: false, error: null, info: null, containers: [], images: [] });
export const docker: DockerState = state;
export async function refreshDocker(): Promise<void> { const api = ports().docker; if (!api) { setState({ connected: false, error: 'Docker transport is not configured.' }); return; } setState({ loading: true, error: null }); try { const [info, containers, images] = await Promise.all([api.info(), api.containers(true), api.images()]); setState({ connected: true, loading: false, info, containers, images }); } catch (error) { setState({ connected: false, loading: false, error: String(error) }); } }
export async function dockerAction(action: 'start' | 'stop' | 'restart', id: string): Promise<void> { const api = ports().docker; if (!api) return; await api[action](id); await refreshDocker(); }
export async function dockerLogs(id: string): Promise<string> { return ports().docker?.logs(id, 200) ?? ''; }
