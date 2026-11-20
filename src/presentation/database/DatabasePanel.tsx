import { createSignal, For, onCleanup, Show, type JSX } from 'solid-js';
import {
  connectSource,
  createGroup,
  dataSources,
  disconnectSource,
  moveSource,
  refreshSource,
  removeGroupConfirmed,
  removeSourceConfirmed,
  renameGroup,
  sections,
  setGroupColor,
  toggleGroup,
} from '../../application/dataSourceStore';
import { openConsole } from '../../application/sqlConsoleStore';
import type { DataGroup } from '../../domain/dataGroup';
import {
  COLOR_PALETTE,
  ENGINE_LABELS,
  SUPPORTED_ENGINES,
  type DataSourceConfig,
  type EngineKind,
} from '../../domain/dataSource';
import { ChevronIcon } from '../layout/icons';
import '../styles/database.css';
import { ColorPicker, ProviderBadge } from './badges';
import { ConnectionDialog } from './ConnectionDialog';
import { SourceTree } from './DataTree';
import {
  DbConsoleIcon,
  DbDatabaseIcon,
  DbFolderIcon,
  DbPlugIcon,
  DbPlusIcon,
  DbRefreshIcon,
  DbUnplugIcon,
} from './dbIcons';

type MenuState = { x: number; y: number } & ({ kind: 'source'; source: DataSourceConfig } | { kind: 'group'; group: DataGroup });

/** The Database tool window: saved connections, in groups, and what lives inside them. */
export default function DatabasePanel(): JSX.Element {
  const [dialog, setDialog] = createSignal<{ initial: DataSourceConfig | null; engine: EngineKind } | null>(null);
  const [addOpen, setAddOpen] = createSignal(false);
  const [menu, setMenu] = createSignal<MenuState | null>(null);
  /** `'new'` while naming a new group, a group id while renaming one. */
  const [naming, setNaming] = createSignal<'new' | string | null>(null);
  const [nameError, setNameError] = createSignal<string | null>(null);

  const selectedSource = (): DataSourceConfig | undefined =>
    dataSources.sources.find((s) => s.id === dataSources.selected?.id);
  const isConnected = (source: DataSourceConfig | undefined) => !!source && dataSources.status[source.id] === 'connected';
  const hasGroups = () => dataSources.groups.length > 0;

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

  const startNaming = (target: 'new' | string) => {
    setNameError(null);
    setNaming(target);
  };
  const finishNaming = (value: string) => {
    const target = naming();
    if (target === null) return;
    const problem = target === 'new' ? (() => {
      const result = createGroup(value);
      return typeof result === 'string' ? result : null;
    })() : renameGroup(target, value);
    if (problem) {
      setNameError(problem);
      return;
    }
    setNaming(null);
  };

  const NameInput = (props: { initial: string }): JSX.Element => (
    <>
      <input
        class="db-inline-input"
        type="text"
        value={props.initial}
        placeholder="Group name"
        aria-label="Group name"
        ref={(el) => queueMicrotask(() => { el.focus(); el.select(); })}
        onInput={() => setNameError(null)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') finishNaming(event.currentTarget.value);
          if (event.key === 'Escape') setNaming(null);
          event.stopPropagation();
        }}
        onBlur={() => setNaming(null)}
      />
      <Show when={nameError()}>{(message) => <div class="db-inline-error" role="alert">{message()}</div>}</Show>
    </>
  );

  const GroupRow = (props: { group: DataGroup; count: number }): JSX.Element => (
    <Show
      when={naming() !== props.group.id}
      fallback={<NameInput initial={props.group.name} />}
    >
      <button
        type="button"
        class="tree-row db-row db-group"
        role="treeitem"
        aria-expanded={!props.group.collapsed}
        style={{ 'padding-left': '6px', '--group-color': COLOR_PALETTE.find((c) => c.id === props.group.color)?.value }}
        onClick={() => toggleGroup(props.group.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ kind: 'group', group: props.group, x: event.clientX, y: event.clientY });
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' && props.group.collapsed) toggleGroup(props.group.id);
          if (event.key === 'ArrowLeft' && !props.group.collapsed) toggleGroup(props.group.id);
        }}
      >
        <span class="tree-chevron" data-expanded={props.group.collapsed ? undefined : ''}>
          <ChevronIcon size={14} />
        </span>
        <span class="tree-icon db-group-icon">
          <DbFolderIcon size={14} />
        </span>
        <span class="tree-name">{props.group.name}</span>
        <span class="db-count">{props.count}</span>
      </button>
    </Show>
  );

  const openSourceMenu = (event: MouseEvent, source: DataSourceConfig) =>
    setMenu({ kind: 'source', source, x: event.clientX, y: event.clientY });

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
                    class="menu-item db-add-item"
                    role="menuitem"
                    onClick={() => {
                      setAddOpen(false);
                      setDialog({ initial: null, engine });
                    }}
                  >
                    <ProviderBadge engine={engine} size={16} />
                    {ENGINE_LABELS[engine]}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
        <button type="button" class="icon-button" title="New Group" aria-label="New Group" onClick={() => startNaming('new')}>
          <DbFolderIcon size={15} />
        </button>
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

      <Show when={naming() === 'new'}>
        <NameInput initial="" />
      </Show>

      <Show
        when={dataSources.sources.length > 0 || hasGroups()}
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
          <For each={sections()}>
            {(section) => (
              <>
                <Show when={section.group} fallback={<Show when={hasGroups()}><div class="db-section-title">Ungrouped</div></Show>}>
                  {(group) => <GroupRow group={group()} count={section.sources.length} />}
                </Show>
                <Show when={!section.group?.collapsed}>
                  <For each={section.sources}>
                    {(source) => <SourceTree source={source} depth={section.group ? 1 : 0} onContextMenu={openSourceMenu} />}
                  </For>
                </Show>
              </>
            )}
          </For>
        </div>
      </Show>

      <Show when={menu()}>
        {(open) => (
          <div class="menu db-context-menu" role="menu" style={{ left: `${open().x}px`, top: `${open().y}px` }}>
            {(() => {
              const m = open();
              if (m.kind === 'group') {
                return (
                  <>
                    <button type="button" class="menu-item" role="menuitem" onClick={run(() => startNaming(m.group.id))}>
                      Rename…
                    </button>
                    <div class="db-submenu-label">Color</div>
                    <div style={{ padding: '2px 10px 6px' }}>
                      <ColorPicker value={m.group.color} noneLabel="No color" onChange={(color) => { setGroupColor(m.group.id, color); closeMenu(); }} />
                    </div>
                    <div class="menu-separator" role="separator" />
                    <button type="button" class="menu-item" role="menuitem" onClick={run(() => removeGroupConfirmed(m.group.id))}>
                      Delete Group…
                    </button>
                  </>
                );
              }
              const source = m.source;
              return (
                <>
                  <Show
                    when={isConnected(source)}
                    fallback={
                      <button type="button" class="menu-item" role="menuitem" onClick={run(() => connectSource(source.id))}>
                        <DbPlugIcon size={13} /> Connect
                      </button>
                    }
                  >
                    <button type="button" class="menu-item" role="menuitem" onClick={run(() => disconnectSource(source.id))}>
                      <DbUnplugIcon size={13} /> Disconnect
                    </button>
                  </Show>
                  <button type="button" class="menu-item" role="menuitem" onClick={run(() => openConsole(source.id))}>
                    <DbConsoleIcon size={13} /> Open Query Console
                  </button>
                  <button type="button" class="menu-item" role="menuitem" disabled={!isConnected(source)} onClick={run(() => refreshSource(source.id))}>
                    <DbRefreshIcon size={13} /> Refresh
                  </button>
                  <div class="menu-separator" role="separator" />
                  <div class="db-submenu-label">Move to group</div>
                  <For each={dataSources.groups}>
                    {(group) => (
                      <button
                        type="button"
                        class="menu-item"
                        role="menuitem"
                        disabled={source.groupId === group.id}
                        onClick={run(() => moveSource(source.id, group.id))}
                      >
                        {group.name}
                      </button>
                    )}
                  </For>
                  <button type="button" class="menu-item" role="menuitem" disabled={source.groupId === null} onClick={run(() => moveSource(source.id, null))}>
                    No group
                  </button>
                  <div class="menu-separator" role="separator" />
                  <button type="button" class="menu-item" role="menuitem" onClick={run(() => setDialog({ initial: source, engine: source.engine }))}>
                    Edit…
                  </button>
                  <button type="button" class="menu-item" role="menuitem" onClick={run(() => removeSourceConfirmed(source.id))}>
                    Delete…
                  </button>
                </>
              );
            })()}
          </div>
        )}
      </Show>

      <Show when={dialog()}>{(open) => <ConnectionDialog initial={open().initial} engine={open().engine} onClose={() => setDialog(null)} />}</Show>
    </>
  );
}
