import { createSignal, For, onCleanup, Show, type JSX } from 'solid-js';
import {
  connectSource,
  dataSources,
  disconnectSource,
  refreshSource,
  removeSourceConfirmed,
} from '../../application/dataSourceStore';
import { openConsole } from '../../application/sqlConsoleStore';
import { ENGINE_LABELS, SUPPORTED_ENGINES, type DataSourceConfig, type EngineKind } from '../../domain/dataSource';
import '../styles/database.css';
import { ConnectionDialog } from './ConnectionDialog';
import { SourceTree } from './DataTree';
import {
  DbConsoleIcon,
  DbPlugIcon,
  DbPlusIcon,
  DbRefreshIcon,
  DbUnplugIcon,
  DbDatabaseIcon,
} from './dbIcons';

interface MenuState {
  x: number;
  y: number;
  source: DataSourceConfig;
}

/** The Database tool window: saved connections and what lives inside them. */
export default function DatabasePanel(): JSX.Element {
  const [dialog, setDialog] = createSignal<{ initial: DataSourceConfig | null; engine: EngineKind } | null>(null);
  const [addOpen, setAddOpen] = createSignal(false);
  const [menu, setMenu] = createSignal<MenuState | null>(null);

  const selectedSource = (): DataSourceConfig | undefined =>
    dataSources.sources.find((s) => s.id === dataSources.selected?.id);
  const isConnected = (source: DataSourceConfig | undefined) => !!source && dataSources.status[source.id] === 'connected';

  const closeMenu = () => {
    setMenu(null);
    setAddOpen(false);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!(event.target as HTMLElement).closest('.db-context-menu, .db-add')) closeMenu();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeMenu();
  };
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown, true);
  onCleanup(() => {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
  });

  const run = (action: () => unknown) => () => {
    closeMenu();
    void action();
  };

  return (
    <>
      <div class="db-toolbar" role="toolbar" aria-label="Database actions">
        <div class="db-add">
          <button
            type="button"
            class="icon-button"
            title="New Data Source"
            aria-label="New Data Source"
            aria-haspopup="menu"
            aria-expanded={addOpen()}
            onClick={() => setAddOpen((open) => !open)}
          >
            <DbPlusIcon size={15} />
          </button>
          <Show when={addOpen()}>
            <div class="menu db-add-menu" role="menu">
              <For each={SUPPORTED_ENGINES}>
                {(engine) => (
                  <button
                    type="button"
                    class="menu-item"
                    role="menuitem"
                    onClick={() => {
                      setAddOpen(false);
                      setDialog({ initial: null, engine });
                    }}
                  >
                    {ENGINE_LABELS[engine]}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
        <button
          type="button"
          class="icon-button"
          title="Refresh"
          aria-label="Refresh"
          disabled={!isConnected(selectedSource())}
          onClick={() => void refreshSource(selectedSource()!.id)}
        >
          <DbRefreshIcon size={15} />
        </button>
        <button
          type="button"
          class="icon-button"
          title="Open Query Console"
          aria-label="Open Query Console"
          disabled={!selectedSource()}
          onClick={() => void openConsole(selectedSource()!.id)}
        >
          <DbConsoleIcon size={15} />
        </button>
        <button
          type="button"
          class="icon-button"
          title="Disconnect"
          aria-label="Disconnect"
          disabled={!isConnected(selectedSource())}
          onClick={() => void disconnectSource(selectedSource()!.id)}
        >
          <DbUnplugIcon size={15} />
        </button>
      </div>

      <Show
        when={dataSources.sources.length > 0}
        fallback={
          <div class="empty-state">
            <DbDatabaseIcon size={28} />
            <span class="empty-state-title">No data sources yet</span>
            <span>Connect to a database to browse its tables and run queries.</span>
            <button type="button" class="button button-primary" onClick={() => setAddOpen(true)}>
              Add data source
            </button>
          </div>
        }
      >
        <div class="tree db-tree" role="tree" aria-label="Data sources">
          <For each={dataSources.sources}>
            {(source) => (
              <SourceTree source={source} onContextMenu={(event, s) => setMenu({ x: event.clientX, y: event.clientY, source: s })} />
            )}
          </For>
        </div>
      </Show>

      <Show when={menu()}>
        {(open) => (
          <div class="menu db-context-menu" role="menu" style={{ left: `${open().x}px`, top: `${open().y}px` }}>
            <Show
              when={isConnected(open().source)}
              fallback={
                <button type="button" class="menu-item" role="menuitem" onClick={run(() => connectSource(open().source.id))}>
                  <DbPlugIcon size={13} /> Connect
                </button>
              }
            >
              <button type="button" class="menu-item" role="menuitem" onClick={run(() => disconnectSource(open().source.id))}>
                <DbUnplugIcon size={13} /> Disconnect
              </button>
            </Show>
            <button type="button" class="menu-item" role="menuitem" onClick={run(() => openConsole(open().source.id))}>
              <DbConsoleIcon size={13} /> Open Query Console
            </button>
            <button
              type="button"
              class="menu-item"
              role="menuitem"
              disabled={!isConnected(open().source)}
              onClick={run(() => refreshSource(open().source.id))}
            >
              <DbRefreshIcon size={13} /> Refresh
            </button>
            <div class="menu-separator" role="separator" />
            <button type="button" class="menu-item" role="menuitem" onClick={run(() => setDialog({ initial: open().source, engine: open().source.engine }))}>
              Edit…
            </button>
            <button type="button" class="menu-item" role="menuitem" onClick={run(() => removeSourceConfirmed(open().source.id))}>
              Delete…
            </button>
          </div>
        )}
      </Show>

      <Show when={dialog()}>{(open) => <ConnectionDialog initial={open().initial} engine={open().engine} onClose={() => setDialog(null)} />}</Show>
    </>
  );
}
