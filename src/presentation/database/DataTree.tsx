import { For, Show, type JSX } from 'solid-js';
import { dataSources, selectNode, toggleNode } from '../../application/dataSourceStore';
import { openTablePreview } from '../../application/sqlConsoleStore';
import { describeTarget, nodeKey, type DataNode, type DataSourceConfig } from '../../domain/dataSource';
import { ChevronIcon } from '../layout/icons';
import {
  DbColumnIcon,
  DbDatabaseIcon,
  DbFolderIcon,
  DbKeyIcon,
  DbTableIcon,
  DbViewIcon,
} from './dbIcons';
import { accentStyle, EnvironmentTag, ProviderBadge } from './badges';

const indent = (depth: number): JSX.CSSProperties => ({ 'padding-left': `calc(6px + ${depth} * var(--tree-indent))` });

function nodeIcon(node: DataNode): JSX.Element {
  switch (node.kind) {
    case 'schema':
      return <DbDatabaseIcon size={14} />;
    case 'folder':
      return <DbFolderIcon size={14} />;
    case 'table':
      return <DbTableIcon size={14} />;
    case 'view':
      return <DbViewIcon size={14} />;
    default:
      return node.detail?.includes('PK') ? <DbKeyIcon size={14} /> : <DbColumnIcon size={14} />;
  }
}

/** Move focus to the row above or below the focused one. */
function moveFocus(from: HTMLElement, step: 1 | -1): void {
  const rows = Array.from(from.closest('.db-tree')?.querySelectorAll<HTMLElement>('.db-row') ?? []);
  rows[rows.indexOf(from) + step]?.focus();
}

function onRowKey(event: KeyboardEvent, handlers: { toggle: () => void; open: () => void; expanded: boolean; expandable: boolean }): void {
  const row = event.currentTarget as HTMLElement;
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      moveFocus(row, 1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      moveFocus(row, -1);
      break;
    case 'ArrowRight':
      if (handlers.expandable && !handlers.expanded) handlers.toggle();
      break;
    case 'ArrowLeft':
      if (handlers.expandable && handlers.expanded) handlers.toggle();
      break;
    case 'Enter':
      handlers.open();
      break;
  }
}

function Chevron(props: { visible: boolean; expanded: boolean; loading: boolean; onToggle: () => void }): JSX.Element {
  return (
    <span
      class="tree-chevron"
      data-expanded={props.expanded ? '' : undefined}
      data-loading={props.loading ? '' : undefined}
      onClick={(event) => {
        event.stopPropagation();
        if (props.visible) props.onToggle();
      }}
    >
      <Show when={props.visible}>
        <ChevronIcon size={14} />
      </Show>
    </span>
  );
}

function NodeRows(props: { id: string; path: string[]; depth: number }): JSX.Element {
  const nodes = () => dataSources.children[props.id]?.[nodeKey(props.path)] ?? [];
  return <For each={nodes()}>{(node) => <NodeRow id={props.id} node={node} depth={props.depth} />}</For>;
}

function NodeRow(props: { id: string; node: DataNode; depth: number }): JSX.Element {
  const key = () => nodeKey(props.node.path);
  const expanded = () => dataSources.expanded[props.id]?.[key()] === true;
  const loading = () => dataSources.loading[props.id]?.[key()] === true;
  const selected = () =>
    dataSources.selected?.id === props.id && nodeKey(dataSources.selected.path) === key();
  const toggle = () => void toggleNode(props.id, props.node.path);
  const isTable = () => props.node.kind === 'table' || props.node.kind === 'view';
  const open = () => {
    if (isTable()) void openTablePreview(props.id, props.node.path[0], props.node.label);
    else if (props.node.hasChildren) toggle();
  };

  return (
    <>
      <button
        type="button"
        class="tree-row db-row"
        role="treeitem"
        aria-expanded={props.node.hasChildren ? expanded() : undefined}
        aria-selected={selected()}
        style={indent(props.depth)}
        title={props.node.detail ? `${props.node.label}: ${props.node.detail}` : props.node.label}
        onClick={() => selectNode(props.id, props.node.path)}
        onDblClick={open}
        onKeyDown={(event) => onRowKey(event, { toggle, open, expanded: expanded(), expandable: props.node.hasChildren })}
      >
        <Chevron visible={props.node.hasChildren} expanded={expanded()} loading={loading()} onToggle={toggle} />
        <span class="tree-icon db-node-icon" data-kind={props.node.kind}>{nodeIcon(props.node)}</span>
        <span class="tree-name">{props.node.label}</span>
        <Show when={props.node.detail}>
          <span class="tree-hint">{props.node.detail}</span>
        </Show>
      </button>
      <Show when={expanded()}>
        <NodeRows id={props.id} path={props.node.path} depth={props.depth + 1} />
      </Show>
    </>
  );
}

/** One connection and everything loaded under it. */
export function SourceTree(props: {
  source: DataSourceConfig;
  /** How far in the row sits; connections inside a group are one level in. */
  depth?: number;
  onContextMenu: (event: MouseEvent, source: DataSourceConfig) => void;
}): JSX.Element {
  const id = () => props.source.id;
  const depth = () => props.depth ?? 0;
  const status = () => dataSources.status[id()] ?? 'disconnected';
  const expanded = () => dataSources.expanded[id()]?.[nodeKey([])] === true;
  const loading = () => status() === 'connecting' || dataSources.loading[id()]?.[nodeKey([])] === true;
  const selected = () => dataSources.selected?.id === id() && dataSources.selected.path.length === 0;
  const toggle = () => void toggleNode(id(), []);

  return (
    <>
      <button
        type="button"
        class="tree-row db-row db-source db-accent"
        role="treeitem"
        aria-expanded={expanded()}
        aria-selected={selected()}
        style={{ ...indent(depth()), ...accentStyle(props.source) }}
        title={describeTarget(props.source)}
        onClick={() => selectNode(id(), [])}
        onDblClick={toggle}
        onContextMenu={(event) => {
          event.preventDefault();
          selectNode(id(), []);
          props.onContextMenu(event, props.source);
        }}
        onKeyDown={(event) => onRowKey(event, { toggle, open: toggle, expanded: expanded(), expandable: true })}
      >
        <Chevron visible expanded={expanded()} loading={loading()} onToggle={toggle} />
        <span class="tree-icon db-engine">
          <ProviderBadge engine={props.source.engine} size={16} />
        </span>
        <span class="tree-name">{props.source.name}</span>
        <EnvironmentTag environment={props.source.environment} />
        <span class="db-status" data-status={status()} title={status()} />
      </button>
      <Show when={status() === 'error' && dataSources.errors[id()]}>
        {(message) => (
          <div class="db-error" role="alert" style={indent(depth() + 1)}>
            {message()}
          </div>
        )}
      </Show>
      <Show when={expanded()}>
        <NodeRows id={id()} path={[]} depth={depth() + 1} />
      </Show>
    </>
  );
}
