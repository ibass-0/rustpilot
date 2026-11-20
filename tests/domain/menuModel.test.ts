import { describe, expect, test } from 'vitest';
import { APP_MENUS, type MenuEntry } from '../../src/domain/menuModel';

const items = (entries: readonly MenuEntry[]): Extract<MenuEntry, { kind: 'item' }>[] =>
  entries.flatMap((entry) => (entry.kind === 'item' ? [entry, ...items(entry.children ?? [])] : []));

const everyItem = APP_MENUS.flatMap((menu) => items(menu.entries));

describe('the application menus', () => {
  test('cover the menus of VS Code and JetBrains in a sensible order', () => {
    expect(APP_MENUS.map((m) => m.label)).toEqual([
      'File', 'Edit', 'Selection', 'View', 'Navigate', 'Code', 'Refactor', 'Git', 'Run', 'Tools', 'Window', 'Help',
    ]);
  });

  test('every menu has entries', () => {
    for (const menu of APP_MENUS) expect(menu.entries.length, menu.label).toBeGreaterThan(3);
  });

  test('every item has a unique id, namespaced by its menu', () => {
    const ids = everyItem.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const menu of APP_MENUS) {
      for (const item of items(menu.entries)) expect(item.id.startsWith(`${menu.id}.`), item.id).toBe(true);
    }
  });

  test('labels are not empty and not repeated within one list', () => {
    const check = (entries: readonly MenuEntry[], where: string) => {
      const labels = entries.flatMap((e) => (e.kind === 'item' ? [e.label] : []));
      expect(new Set(labels).size, where).toBe(labels.length);
      for (const entry of entries) {
        if (entry.kind === 'item') {
          expect(entry.label.trim(), entry.id).not.toBe('');
          if (entry.children) check(entry.children, entry.id);
        }
      }
    };
    for (const menu of APP_MENUS) check(menu.entries, menu.id);
  });

  test('separators never lead, trail or double up', () => {
    const check = (entries: readonly MenuEntry[], where: string) => {
      expect(entries[0]?.kind, `${where} start`).not.toBe('separator');
      expect(entries[entries.length - 1]?.kind, `${where} end`).not.toBe('separator');
      entries.forEach((entry, i) => {
        if (entry.kind === 'separator') expect(entries[i - 1]?.kind, `${where} double`).not.toBe('separator');
        else if (entry.children) check(entry.children, entry.id);
      });
    };
    for (const menu of APP_MENUS) check(menu.entries, menu.id);
  });

  test('shortcuts are written the same way everywhere', () => {
    for (const item of everyItem) {
      if (!item.shortcut) continue;
      expect(item.shortcut, item.id).toMatch(/^((Ctrl|Alt|Shift)\+)*([A-Z0-9]|F\d{1,2}|Enter|Tab|Space|Home|End|Up|Down|Left|Right|Insert|Delete|\\|\/|,|\.|\[|\]|\+|-|=|`)$/);
    }
  });

  test('a submenu has children and no shortcut of its own', () => {
    for (const item of everyItem) {
      if (item.children) {
        expect(item.children.length, item.id).toBeGreaterThan(0);
        expect(item.shortcut, item.id).toBeUndefined();
      }
    }
  });

  test('the items that already work are present', () => {
    const ids = everyItem.map((i) => i.id);
    expect(ids).toContain('file.openFolder');
    expect(ids).toContain('file.addFolder');
    expect(ids).toContain('help.about');
  });

  test('the same shortcut is not given to two different commands', () => {
    const seen = new Map<string, string>();
    for (const item of everyItem) {
      if (!item.shortcut) continue;
      const other = seen.get(item.shortcut);
      expect(other, `${item.shortcut} is used by both ${other} and ${item.id}`).toBeUndefined();
      seen.set(item.shortcut, item.id);
    }
  });
});
