import { createStore } from 'solid-js/store';
import type { SshProfile, SshSession, SshPane, SshWindow, SshPaneDirection } from '../domain/ssh';
import { ports } from './ports';

interface SshState { profiles: SshProfile[]; sessions: SshSession[]; windows: SshWindow[]; }
const [state, setState] = createStore<SshState>({ profiles: [], sessions: [], windows: [] });
export const ssh = state;

export function addProfile(profile: SshProfile): void { setState('profiles', (items) => [...items.filter((item) => item.id !== profile.id), profile]); }
export function removeProfile(id: string): void { setState('profiles', (items) => items.filter((item) => item.id !== id)); }
export async function connectProfile(profile: SshProfile): Promise<void> {
  if (!ports().ssh) throw new Error('SSH transport is not configured.');
  const session: SshSession = { id: crypto.randomUUID(), profileId: profile.id, status: 'connecting' };
  setState('sessions', (items) => [...items, session]);
  try {
    await ports().ssh.connect(session.id, profile, () => undefined, (code) => setState('sessions', (item) => item.id === session.id, 'status', code === 0 ? 'disconnected' : 'error'));
    setState('sessions', (item) => item.id === session.id, 'status', 'connected');
  } catch (error) { setState('sessions', (item) => item.id === session.id, { status: 'error', error: String(error) }); }
}
export async function disconnectSession(id: string): Promise<void> { await ports().ssh?.disconnect(id); setState('sessions', (items) => items.filter((item) => item.id !== id)); }

export function createSshWindow(sessionId: string, name = 'SSH'): string {
  const id = crypto.randomUUID();
  const pane: SshPane = { id: crypto.randomUUID(), sessionId, title: 'shell', focused: true };
  setState('windows', (items) => [...items, { id, name, panes: [pane], attached: true }]);
  return id;
}
export function splitSshPane(windowId: string, paneId: string, _direction: SshPaneDirection): string | null {
  const window = state.windows.find((item) => item.id === windowId); const source = window?.panes.find((item) => item.id === paneId);
  if (!window || !source) return null;
  const id = crypto.randomUUID();
  setState('windows', windowId, 'panes', (panes) => [...panes.map((pane) => ({ ...pane, focused: false })), { id, sessionId: source.sessionId, title: 'shell', focused: true }]);
  return id;
}
export function focusSshPane(windowId: string, paneId: string): void { setState('windows', windowId, 'panes', (panes) => panes.map((pane) => ({ ...pane, focused: pane.id === paneId }))); }
export function renameSshWindow(windowId: string, name: string): void { setState('windows', windowId, 'name', name.trim() || 'SSH'); }
export function detachSshWindow(windowId: string): void { setState('windows', windowId, 'attached', false); }
export function attachSshWindow(windowId: string): void { setState('windows', windowId, 'attached', true); }
export function closeSshPane(windowId: string, paneId: string): void { setState('windows', windowId, 'panes', (panes) => panes.filter((pane) => pane.id !== paneId)); }
