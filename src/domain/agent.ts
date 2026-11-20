export type AgentProviderId = 'claude' | 'openai' | 'antigravity';
export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'toolCall'; name: string; input: unknown }
  | { type: 'toolResult'; name: string; output: string }
  | { type: 'approval'; id: string; action: string; detail: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface AgentMessage { role: 'user' | 'assistant'; content: string; }
export interface AgentModel { id: string; label: string; }
export interface AgentCapabilities { streaming: boolean; tools: boolean; patchReview: boolean; }
export interface AgentRequest { provider: AgentProviderId; model: string; messages: AgentMessage[]; workspaceRoot?: string; }

export interface AgentProvider {
  readonly id: AgentProviderId;
  listModels(): Promise<AgentModel[]>;
  capabilities(): AgentCapabilities;
  send(request: AgentRequest, onEvent: (event: AgentEvent) => void): Promise<void>;
  cancel(): Promise<void>;
}

export interface AgentPort {
  providers(): AgentProviderId[];
  models(provider: AgentProviderId): Promise<AgentModel[]>;
  send(request: AgentRequest, onEvent: (event: AgentEvent) => void): Promise<void>;
  cancel(): Promise<void>;
}
