import { For, Show, type JSX } from 'solid-js';
import { layout, toggleToolWindow } from '../../application/layoutStore';
import { TOOL_WINDOW_IDS, TOOL_WINDOW_SIDE, type Side, type ToolWindowId } from '../../domain/layout';
import { TOOL_WINDOWS, type ToolWindowInfo } from './toolWindows';

function StripeButton(props: { info: ToolWindowInfo }): JSX.Element {
  const isOpen = () => layout.open[TOOL_WINDOW_SIDE[props.info.id]] === props.info.id;
  const tooltip = () => (props.info.shortcut ? `${props.info.title} (${props.info.shortcut})` : props.info.title);
  return (
    <button
      type="button"
      class="stripe-button"
      title={tooltip()}
      aria-label={props.info.title}
      aria-pressed={isOpen()}
      onClick={() => toggleToolWindow(props.info.id)}
    >
      {props.info.icon(18)}
      <Show when={(props.info.badge?.() ?? 0) > 0}>
        <span class="stripe-badge">{Math.min(props.info.badge?.() ?? 0, 99)}</span>
      </Show>
    </button>
  );
}

const idsOn = (sides: readonly Side[], group: 'top' | 'bottom'): ToolWindowId[] =>
  TOOL_WINDOW_IDS.filter((id) => sides.includes(TOOL_WINDOW_SIDE[id]) && TOOL_WINDOWS[id].group === group);

/**
 * A vertical strip of tool window buttons. The left stripe carries the left
 * tool windows at the top and the bottom ones at its foot; the right stripe
 * carries the right tool windows.
 */
export function Stripe(props: { side: 'left' | 'right' }): JSX.Element {
  const sides = (): Side[] => (props.side === 'left' ? ['left', 'bottom'] : ['right']);
  return (
    <nav class={`stripe stripe-${props.side}`} aria-label={`${props.side} tool windows`}>
      <div class="stripe-group">
        <For each={idsOn(sides(), 'top')}>{(id) => <StripeButton info={TOOL_WINDOWS[id]} />}</For>
      </div>
      <div class="stripe-group">
        <For each={idsOn(sides(), 'bottom')}>{(id) => <StripeButton info={TOOL_WINDOWS[id]} />}</For>
      </div>
    </nav>
  );
}
