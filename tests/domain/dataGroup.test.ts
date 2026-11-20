import { describe, expect, test } from 'vitest';
import { arrangeSources, normalizeGroup, validateGroupName, type DataGroup } from '../../src/domain/dataGroup';
import { newConfig, type DataSourceConfig } from '../../src/domain/dataSource';

const group = (id: string, name = id): DataGroup => ({ id, name, collapsed: false, color: null });
const source = (id: string, groupId: string | null): DataSourceConfig => ({ ...newConfig('sqlite', id), name: id, groupId });

describe('validateGroupName', () => {
  const others = [group('g1', 'Production'), group('g2', 'Staging')];

  test('needs a name', () => {
    expect(validateGroupName('  ', others)).toBe('Enter a group name.');
  });

  test('names are unique regardless of case', () => {
    expect(validateGroupName('production', others)).toBe('A group with this name already exists.');
    expect(validateGroupName(' Staging ', others)).toBe('A group with this name already exists.');
  });

  test('a group may keep its own name', () => {
    expect(validateGroupName('Production', others, 'g1')).toBeNull();
  });

  test('at most 60 characters', () => {
    expect(validateGroupName('x'.repeat(61), others)).toBe('Use at most 60 characters.');
    expect(validateGroupName('x'.repeat(60), others)).toBeNull();
  });
});

describe('normalizeGroup', () => {
  test('accepts a group and fills defaults', () => {
    expect(normalizeGroup({ id: 'g1', name: 'Prod' })).toEqual({ id: 'g1', name: 'Prod', collapsed: false, color: null });
    expect(normalizeGroup({ id: 'g1', name: 'Prod', collapsed: true, color: 'red' })).toEqual({
      id: 'g1',
      name: 'Prod',
      collapsed: true,
      color: 'red',
    });
  });

  test('rejects what is not a group and drops unknown colors', () => {
    expect(normalizeGroup(null)).toBeNull();
    expect(normalizeGroup({ id: 1, name: 'x' })).toBeNull();
    expect(normalizeGroup({ id: 'g1', name: 'x', color: 'chartreuse' })?.color).toBeNull();
  });
});

describe('arrangeSources', () => {
  test('groups in their order, then the ungrouped sources', () => {
    const sections = arrangeSources(
      [group('g2'), group('g1')],
      [source('a', 'g1'), source('b', null), source('c', 'g2'), source('d', 'g1')],
    );
    expect(sections.map((s) => [s.group?.id ?? null, s.sources.map((x) => x.id)])).toEqual([
      ['g2', ['c']],
      ['g1', ['a', 'd']],
      [null, ['b']],
    ]);
  });

  test('a source whose group is gone counts as ungrouped', () => {
    const sections = arrangeSources([group('g1')], [source('a', 'missing')]);
    expect(sections.map((s) => [s.group?.id ?? null, s.sources.map((x) => x.id)])).toEqual([
      ['g1', []],
      [null, ['a']],
    ]);
  });

  test('empty groups are kept and the ungrouped section only appears when it has sources', () => {
    expect(arrangeSources([group('g1')], []).map((s) => s.group?.id ?? null)).toEqual(['g1']);
    expect(arrangeSources([], [])).toEqual([]);
  });
});
