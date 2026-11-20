import { createEffect, For, Show, type JSX } from 'solid-js';
import type { EngineKind } from '../../domain/dataSource';
import { dataSources, tablesOf } from '../../application/dataSourceStore';
import { attach, attachedSource, runFile, sqlConsole, stop } from '../../application/sqlConsoleStore';
import '../styles/database.css';
import { accentStyle, EnvironmentTag, ProviderBadge } from './badges';
import { DbPlayIcon, DbStopIcon } from './dbIcons';

/** What the bar needs from the editor engine. */
export interface SqlSurface {
  setSqlSchema(path: string, schema: Record<string, string[]>, engine: EngineKind): void;
}

/** Above the editor of a `.sql` file: which connection it runs on, and Run / Stop. */
export default function ConsoleBar(props: { path: string; surface: SqlSurface }): JSX.Element {
  const sourceId = () => attachedSource(props.path);
  const running = () => sqlConsole.running !== null;
  const source = () => dataSources.sources.find((s) => s.id === sourceId());

  // Keep the editor's completion list in step with what the tree has loaded.
  createEffect(() => {
    const id = sourceId();
    const source = dataSources.sources.find((s) => s.id === id);
    if (id && source) props.surface.setSqlSchema(props.path, tablesOf(id), source.engine);
  });

  return (
    <div class="console-bar" role="toolbar" aria-label="Query console" style={source() ? accentStyle(source()!) : {}}>
      <Show when={source()}>
        {(src) => (
          <span class="console-source-name" title={src().name}>
            <ProviderBadge engine={src().engine} size={16} />
            <EnvironmentTag environment={src().environment} />
          </span>
        )}
      </Show>
      <label for="console-source">Connection</label>
      <select
        id="console-source"
        value={sourceId() ?? ''}
        onChange={(event) => attach(props.path, event.currentTarget.value || null)}
      >
        <option value="">(none)</option>
        <For each={dataSources.sources}>{(source) => <option value={source.id} selected={source.id === sourceId()}>{source.name}</option>}</For>
      </select>
      <button
        type="button"
        class="icon-button console-run"
        title="Run (Ctrl+Enter)"
        aria-label="Run"
        disabled={!sourceId()}
        onClick={() => void runFile(props.path)}
      >
        <DbPlayIcon size={15} />
      </button>
      <button
        type="button"
        class="icon-button console-stop"
        title="Stop"
        aria-label="Stop"
        disabled={!running()}
        onClick={() => void stop()}
      >
        <DbStopIcon size={14} />
      </button>
      <span class="console-bar-spacer" />
      <button type="button" class="button" disabled={!sourceId()} title="Run the whole file (Ctrl+Shift+Enter)" onClick={() => void runFile(props.path, true)}>
        Run all
      </button>
    </div>
  );
}
