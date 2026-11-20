export type SshAuthMethod = 'password' | 'privateKey' | 'agent';
export type SshSessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface SshProfile {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  auth: SshAuthMethod;
  privateKeyPath?: string;
}

export interface SshSession {
  id: string;
  profileId: string;
  status: SshSessionStatus;
  fingerprint?: string;
  error?: string;
}

export interface SshOutput { sessionId: string; data: string; }

export type SshPaneDirection = 'horizontal' | 'vertical';
export interface SshPane { id: string; sessionId: string; title: string; focused: boolean; }
export interface SshWindow { id: string; name: string; panes: SshPane[]; attached: boolean; }

