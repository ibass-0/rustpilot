import { createStore, reconcile, unwrap } from 'solid-js/store';
import {
  clampPanelSize,
  defaultLayout,
  parseLayout,
  TOOL_WINDOW_SIDE,
  type LayoutState,
  type Side,
  type ToolWindowId,
} from '../domain/layout';
import { ports } from './ports';

const STORAGE_KEY = 'rustpilot.layout.v1';

const [state, setState] = createStore<LayoutState>(defaultLayout());

/** Read-only view of the layout; change it through the functions below. */
export const layout: LayoutState = state;

function persist(): void {
  ports().storage.set(STORAGE_KEY, JSON.stringify(unwrap(state)));
}

/** Load the saved layout; anything invalid falls back to the default. */
export function loadLayout(): void {
  setState(reconcile(parseLayout(ports().storage.get(STORAGE_KEY)) ?? defaultLayout()));
}

export function toggleToolWindow(id: ToolWindowId): void {
  const side = TOOL_WINDOW_SIDE[id];
  setState('open', side, state.open[side] === id ? null : id);
  persist();
}

/** Set a panel size, clamped to `[MIN_PANEL_PX, maxPx]`. */
export function setPanelSize(side: Side, px: number, maxPx: number): void {
  setState('size', side, clampPanelSize(px, maxPx));
  persist();
}

export function moveToolWindow(id: ToolWindowId, before: ToolWindowId | null): void {
  const next = state.order.filter((item) => item !== id);
  const index = before ? next.indexOf(before) : next.length;
  next.splice(index < 0 ? next.length : index, 0, id);
  setState('order', next);
  persist();
}
