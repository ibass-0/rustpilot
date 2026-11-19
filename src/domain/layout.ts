export type Side = 'left' | 'right' | 'bottom';
export type ToolWindowId = 'project' | 'agent' | 'terminal';

export const TOOL_WINDOW_SIDE: Record<ToolWindowId, Side> = {
  project: 'left',
  agent: 'right',
  terminal: 'bottom',
};

export const MIN_PANEL_PX = 160;

export interface LayoutState {
  open: Record<Side, ToolWindowId | null>;
  size: Record<Side, number>;
}

export const DEFAULT_LAYOUT: LayoutState = {
  open: { left: 'project', right: null, bottom: null },
  size: { left: 280, right: 360, bottom: 240 },
};

const SIDES: readonly Side[] = ['left', 'right', 'bottom'];

export function defaultLayout(): LayoutState {
  return structuredClone(DEFAULT_LAYOUT);
}

/** Parse a persisted layout. Returns `null` for anything that is not a complete, valid layout. */
export function parseLayout(raw: string | null): LayoutState | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { open, size } = data as { open?: Record<string, unknown>; size?: Record<string, unknown> };
  if (typeof open !== 'object' || open === null || typeof size !== 'object' || size === null) return null;

  const result = defaultLayout();
  for (const side of SIDES) {
    const id = open[side];
    const px = size[side];
    const idValid = id === null || (typeof id === 'string' && TOOL_WINDOW_SIDE[id as ToolWindowId] === side);
    if (!idValid || typeof px !== 'number' || !Number.isFinite(px) || px < MIN_PANEL_PX) return null;
    result.open[side] = id as ToolWindowId | null;
    result.size[side] = px;
  }
  return result;
}

/** Clamp a panel size to `[MIN_PANEL_PX, maxPx]`, in whole pixels. */
export function clampPanelSize(px: number, maxPx: number): number {
  const upper = Math.max(MIN_PANEL_PX, maxPx);
  return Math.round(Math.min(Math.max(px, MIN_PANEL_PX), upper));
}
