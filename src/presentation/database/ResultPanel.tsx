import { Show, type JSX } from 'solid-js';
import { dataSources } from '../../application/dataSourceStore';
import { attachedSource, setResultHeight, sqlConsole } from '../../application/sqlConsoleStore';
import { resultSummary } from '../../domain/sql';
import '../styles/database.css';
import { accentStyle, EnvironmentTag } from './badges';
import { ResultGrid } from './ResultGrid';

/** What the last run of a console file returned, under its editor. */
export default function ResultPanel(props: { path: string }): JSX.Element {
  const outcome = () => sqlConsole.results[props.path];
  const running = () => sqlConsole.running?.path === props.path;
  const source = () => dataSources.sources.find((s) => s.id === attachedSource(props.path));

  const startResize = (event: PointerEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = sqlConsole.resultHeight;
    const move = (e: PointerEvent) => setResultHeight(startHeight + (startY - e.clientY));
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  return (
    <section
      class="result-panel"
      style={{ height: `${sqlConsole.resultHeight}px`, ...(source() ? accentStyle(source()!) : {}) }}
      aria-label="Query result"
    >
      <div class="result-resizer" onPointerDown={startResize} />
      <header class="result-header">
        <Show when={source()}>
          {(src) => (
            <span class="console-source-name">
              {src().name}
              <EnvironmentTag environment={src().environment} />
            </span>
          )}
        </Show>
        <Show when={running()} fallback={<Show when={outcome()?.result}>{(result) => <span>{resultSummary(result())}</span>}</Show>}>
          <span>Running…</span>
        </Show>
        <Show when={outcome()?.result?.truncated}>
          <span>Showing the first 500 rows</span>
        </Show>
        <span class="result-sql" title={outcome()?.sql}>
          {outcome()?.sql.replace(/\s+/g, ' ')}
        </span>
      </header>
      <Show when={outcome()?.error}>
        {(message) => (
          <div class="result-error" role="alert">
            {message()}
          </div>
        )}
      </Show>
      <Show when={outcome()?.result}>
        {(result) => (
          <Show
            when={result().columns.length > 0}
            fallback={<div class="result-empty">{resultSummary(result())}. The statement returned no rows.</div>}
          >
            <ResultGrid result={result()} />
          </Show>
        )}
      </Show>
    </section>
  );
}
