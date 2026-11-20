import { createSignal, For, Show, type JSX } from 'solid-js';
import { layout, moveToolWindow, toggleToolWindow } from '../../application/layoutStore';
import { TOOL_WINDOW_IDS, TOOL_WINDOW_SIDE, type Side, type ToolWindowId } from '../../domain/layout';
import { TOOL_WINDOWS, type ToolWindowInfo } from './toolWindows';

function StripeButton(props: { info: ToolWindowInfo; dragging: boolean; onDragStart: (id: ToolWindowId) => void; onDragOver: (id: ToolWindowId, event: DragEvent) => void; onDrop: () => void }): JSX.Element {
  const isOpen = () => layout.open[TOOL_WINDOW_SIDE[props.info.id]] === props.info.id;
  const tooltip = () => (props.info.shortcut ? `${props.info.title} (${props.info.shortcut})` : props.info.title);
  return (
    <button
      type="button"
      class="stripe-button"
      title={tooltip()}
      aria-label={props.info.title}
      aria-pressed={isOpen()}
      classList={{ 'is-dragging': props.dragging }}
      draggable="true"
      onDragStart={() => props.onDragStart(props.info.id)}
      onDragOver={(event) => props.onDragOver(props.info.id, event)}
      onDrop={() => props.onDrop()}
      onClick={() => toggleToolWindow(props.info.id)}
    >
      {props.info.icon(18)}
      <Show when={(props.info.badge?.() ?? 0) > 0}>
        <span class="stripe-badge">{Math.min(props.info.badge?.() ?? 0, 99)}</span>
      </Show>
    </button>
  );
}

const idsOn = (order: readonly ToolWindowId[], sides: readonly Side[], group: 'top' | 'bottom'): ToolWindowId[] =>
  order.filter((id) => sides.includes(TOOL_WINDOW_SIDE[id]) && TOOL_WINDOWS[id].group === group);

/**
 * A vertical strip of tool window buttons. The left stripe carries the left
 * tool windows at the top and the bottom ones at its foot; the right stripe
 * carries the right tool windows.
 */
export function Stripe(props: { side: 'left' | 'right' }): JSX.Element {
  const [dragged, setDragged] = createSignal<ToolWindowId | null>(null);
  const dragStart = (id: ToolWindowId) => { setDragged(id); };
  const dragOver = (id: ToolWindowId, event: DragEvent) => { event.preventDefault(); const source = dragged(); if (source && source !== id) moveToolWindow(source, id); };
  const drop = () => { setDragged(null); };
  const sides = (): Side[] => (props.side === 'left' ? ['left', 'bottom'] : ['right']);
  return (
    <nav class={`stripe stripe-${props.side}`} aria-label={`${props.side} tool windows`}>
      <div class="stripe-group">
        <For each={idsOn(layout.order, sides(), 'top')}>{(id) => <StripeButton info={TOOL_WINDOWS[id]} dragging={dragged() === id} onDragStart={dragStart} onDragOver={dragOver} onDrop={drop} />}</For>
      </div>
      <div class="stripe-group">
        <For each={idsOn(layout.order, sides(), 'bottom')}>{(id) => <StripeButton info={TOOL_WINDOWS[id]} dragging={dragged() === id} onDragStart={dragStart} onDragOver={dragOver} onDrop={drop} />}</For>
      </div>
    </nav>
  );
}
