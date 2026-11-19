import { expect, test } from 'vitest';
import { parseLayout, TOOL_WINDOW_IDS, TOOL_WINDOW_SIDE, type LayoutState } from '../../src/domain/layout';

const stored = (open: LayoutState['open']) =>
  JSON.stringify({ open, size: { left: 280, right: 360, bottom: 240 } });

test.each([
  ['project', 'left'],
  ['commit', 'left'],
  ['search', 'left'],
  ['structure', 'left'],
  ['agent', 'right'],
  ['database', 'right'],
  ['notifications', 'right'],
  ['run', 'bottom'],
  ['terminal', 'bottom'],
  ['problems', 'bottom'],
  ['git', 'bottom'],
] as const)('the %s tool window docks on the %s', (id, side) => {
  expect(TOOL_WINDOW_SIDE[id]).toBe(side);
});

test('every tool window id has a side', () => {
  expect(Object.keys(TOOL_WINDOW_SIDE).sort()).toEqual([...TOOL_WINDOW_IDS].sort());
});

test('a stored layout may have any tool window open on its own side', () => {
  const layout = parseLayout(stored({ left: 'search', right: 'database', bottom: 'problems' }));
  expect(layout?.open).toEqual({ left: 'search', right: 'database', bottom: 'problems' });
});

test('a stored layout with a tool window on the wrong side is rejected', () => {
  expect(parseLayout(stored({ left: 'database', right: null, bottom: null }))).toBeNull();
  expect(parseLayout(stored({ left: 'project', right: 'git', bottom: null }))).toBeNull();
});
