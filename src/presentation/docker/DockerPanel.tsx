import { createSignal, For, onMount, Show, type JSX } from 'solid-js';
import { docker, dockerAction, dockerLogs, refreshDocker } from '../../application/dockerStore';

export function DockerPanel(): JSX.Element {
  const [selected, setSelected] = createSignal<string | null>(null);
  const [logs, setLogs] = createSignal('');
  onMount(() => void refreshDocker());
  const showLogs = async (id: string) => { setSelected(id); setLogs(await dockerLogs(id)); };
  return <div class="docker-panel"><div class="docker-toolbar"><strong>Containers</strong><button type="button" class="icon-button" onClick={() => void refreshDocker()} title="Refresh">↻</button></div><Show when={!docker.loading} fallback={<div class="empty-state">Connecting to Docker...</div>}><Show when={!docker.error} fallback={<div class="empty-state">{docker.error}</div>}><div class="docker-list"><For each={docker.containers}>{(container) => <div class="docker-container"><button type="button" class="docker-container-main" onClick={() => void showLogs(container.id)}><strong>{container.name}</strong><small>{container.image} · {container.status}</small></button><div class="docker-actions"><button type="button" onClick={() => void dockerAction(container.state === 'running' ? 'stop' : 'start', container.id)}>{container.state === 'running' ? 'Stop' : 'Start'}</button><button type="button" onClick={() => void dockerAction('restart', container.id)}>Restart</button></div></div>}</For></div><Show when={selected()}><section class="docker-logs"><header>Logs</header><pre>{logs()}</pre></section></Show><Show when={docker.containers.length === 0}><div class="empty-state">No Docker containers found.</div></Show></Show></Show></div>;
}
