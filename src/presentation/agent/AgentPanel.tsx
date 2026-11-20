import { createSignal, For, Show, type JSX } from 'solid-js';
import { runTerminalCommand } from '../../application/terminalStore';
import type { AgentProviderId } from '../../domain/agent';

const providers: Array<{ id: AgentProviderId; label: string; status: string }> = [
  { id: 'claude', label: 'Claude', status: 'Not configured' },
  { id: 'openai', label: 'Codex / OpenAI', status: 'Not configured' },
  { id: 'antigravity', label: 'Antigravity', status: 'Adapter pending' },
];

export function AgentPanel(): JSX.Element {
  const [provider, setProvider] = createSignal<AgentProviderId>('claude');
  const [installing, setInstalling] = createSignal(false);
  const current = () => providers.find((item) => item.id === provider())!;
  const installClaude = () => { setInstalling(true); void runTerminalCommand('npm install @anthropic-ai/sdk').finally(() => setInstalling(false)); };
  return <div class="agent-panel"><div class="agent-toolbar"><label for="agent-provider">Provider</label><select id="agent-provider" value={provider()} onChange={(event) => setProvider(event.currentTarget.value as AgentProviderId)}><For each={providers}>{(item) => <option value={item.id}>{item.label}</option>}</For></select></div><div class="agent-empty"><span class="agent-empty-mark">*</span><strong>{current().label} Agent</strong><span>{current().status}</span><Show when={current().id === 'claude'}><span>Install the official Claude SDK in the workspace environment.</span><button type="button" class="agent-install" disabled={installing()} onClick={installClaude}>{installing() ? 'Installing...' : 'Install Claude SDK'}</button></Show><Show when={current().id !== 'claude'}><span>{current().id === 'antigravity' ? 'The provider adapter will be enabled after its official API or CLI is configured.' : 'Configure credentials in Settings to start a conversation.'}</span></Show></div></div>;
}
