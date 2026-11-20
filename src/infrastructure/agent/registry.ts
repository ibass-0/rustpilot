import type { AgentPort, AgentProvider, AgentProviderId, AgentRequest, AgentEvent, AgentModel } from '../../domain/agent';

/** Routes one agent request to a configured provider without exposing vendor details to the UI. */
export function createAgentRegistry(configured: Partial<Record<AgentProviderId, AgentProvider>>): AgentPort {
  const provider = (id: AgentProviderId): AgentProvider => configured[id] ?? {
    id,
    listModels: async () => [],
    capabilities: () => ({ streaming: false, tools: false, patchReview: false }),
    send: async (_request, onEvent) => onEvent({ type: 'error', message: `${id} is not configured.` }),
    cancel: async () => undefined,
  };
  return {
    providers: () => (Object.keys(configured) as AgentProviderId[]),
    models: (id): Promise<AgentModel[]> => provider(id).listModels(),
    send: (request: AgentRequest, onEvent: (event: AgentEvent) => void) => provider(request.provider).send(request, onEvent),
    cancel: () => Promise.all(Object.values(configured).map((item) => item.cancel())).then(() => undefined),
  };
}
