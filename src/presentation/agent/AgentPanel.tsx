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
  const [busy, setBusy] = createSignal(false);
  const current = () => providers.find((item) => item.id === provider())!;
  const run = (command: string) => { setBusy(true); void runTerminalCommand(command).finally(() => setBusy(false)); };
  return <div class="agent-panel"><div class="agent-toolbar"><label for="agent-provider">Provider</label><select id="agent-provider" value={provider()} onChange={(event) => setProvider(event.currentTarget.value as AgentProviderId)}><For each={providers}>{(item) => <option value={item.id}>{item.label}</option>}</For></select></div><div class="agent-empty"><span class="agent-empty-mark">*</span><strong>{current().label} Agent</strong><span>{current().status}</span><Show when={current().id === 'claude'}><span>Install the official Claude SDK in the workspace environment.</span><button type="button" class="agent-install" disabled={busy()} onClick={() => run('npm install @anthropic-ai/sdk')}>{busy() ? 'Installing...' : 'Install Claude SDK'}</button></Show><Show when={current().id === 'openai'}><span>Sign in with your ChatGPT/Codex subscription.</span><button type="button" class="agent-install" disabled={busy()} onClick={() => run('codex login')}>{busy() ? 'Opening login...' : 'Connect Codex subscription'}</button></Show><Show when={current().id === 'antigravity'}><span>The provider adapter will be enabled after its official API or CLI is configured.</span></Show></div></div>;
}
