import { COLOR_PALETTE, type DataSourceConfig } from './dataSource';

/** A named folder of connections in the Database tool window. One level, no nesting. */
export interface DataGroup {
  id: string;
  name: string;
  collapsed: boolean;
  /** An id from `COLOR_PALETTE`, or `null`. */
  color: string | null;
}

export interface SourceSection {
  /** `null` for the connections without a group. */
  group: DataGroup | null;
  sources: DataSourceConfig[];
}

const MAX_NAME = 60;

/** The message to show, or `null` when `name` is fine. `selfId` is the group being renamed. */
export function validateGroupName(name: string, others: readonly DataGroup[], selfId?: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Enter a group name.';
  if (trimmed.length > MAX_NAME) return `Use at most ${MAX_NAME} characters.`;
  const taken = others.some((g) => g.id !== selfId && g.name.trim().toLowerCase() === trimmed.toLowerCase());
  return taken ? 'A group with this name already exists.' : null;
}

export function normalizeGroup(value: unknown): DataGroup | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  const color = typeof v.color === 'string' && COLOR_PALETTE.some((c) => c.id === v.color) ? v.color : null;
  return { id: v.id, name: v.name, collapsed: v.collapsed === true, color };
}

/** Groups in their own order, then a section of the connections without a (known) group, when there are any. */
export function arrangeSources(groups: readonly DataGroup[], sources: readonly DataSourceConfig[]): SourceSection[] {
  const known = new Set(groups.map((g) => g.id));
  const sections: SourceSection[] = groups.map((group) => ({
    group,
    sources: sources.filter((s) => s.groupId === group.id),
  }));
  const ungrouped = sources.filter((s) => s.groupId === null || !known.has(s.groupId));
  if (ungrouped.length > 0) sections.push({ group: null, sources: ungrouped });
  return sections;
}
