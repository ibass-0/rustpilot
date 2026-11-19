import { For, type JSX } from 'solid-js';
import { layout, toggleToolWindow } from '../../application/layoutStore';
import { TOOL_WINDOW_SIDE, type ToolWindowId } from '../../domain/layout';

export interface StripeItem {
  id: ToolWindowId;
  label: string;
  shortcut: string;
  icon: () => JSX.Element;
}

function StripeButton(props: { item: StripeItem }): JSX.Element {
  const isOpen = () => layout.open[TOOL_WINDOW_SIDE[props.item.id]] === props.item.id;
  return (
    <button
      type="button"
      class="stripe-button"
      title={`${props.item.label} (${props.item.shortcut})`}
      aria-label={props.item.label}
      aria-pressed={isOpen()}
      onClick={() => toggleToolWindow(props.item.id)}
    >
      {props.item.icon()}
    </button>
  );
}

/** A vertical strip of tool window buttons, split into a top and a bottom group. */
export function Stripe(props: { side: 'left' | 'right'; top: StripeItem[]; bottom?: StripeItem[] }): JSX.Element {
  return (
    <nav class={`stripe stripe-${props.side}`} aria-label={`${props.side} tool windows`}>
      <div class="stripe-group">
        <For each={props.top}>{(item) => <StripeButton item={item} />}</For>
      </div>
      <div class="stripe-group">
        <For each={props.bottom ?? []}>{(item) => <StripeButton item={item} />}</For>
      </div>
    </nav>
  );
}
