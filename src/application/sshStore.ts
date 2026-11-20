import { createStore } from 'solid-js/store';
import type { SshProfile, SshSession } from '../domain/ssh';
import { ports } from './ports';

interface SshState { profiles: SshProfile[]; sessions: SshSession[]; }
const [state, setState] = createStore<SshState>({ profiles: [], sessions: [] });
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
