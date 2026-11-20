import { For, onMount, Show, type JSX } from 'solid-js';
import { loadTasks, runTask, tasks } from '../../application/taskStore';

export function RunPanel(): JSX.Element {
  onMount(() => void loadTasks());
  return <div class="run-panel">
    <div class="run-toolbar"><button type="button" class="button" onClick={() => void loadTasks()}>Reload Tasks</button></div>
    <Show when={!tasks.error} fallback={<div class="empty-state">No valid tasks file found.</div>}>
      <For each={tasks.tasks} fallback={<div class="empty-state">Add tasks to .rustpilot/tasks.json</div>}>
        {(task) => <button type="button" class="run-task" onClick={() => void runTask(task)}><span>{task.name}</span><code>{task.command}</code></button>}
      </For>
    </Show>
  </div>;
}
