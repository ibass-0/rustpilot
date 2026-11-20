import { beforeEach, expect, test } from 'vitest';
import {
  createGroup,
  dataSources,
  loadSources,
  moveSource,
  removeGroupConfirmed,
  renameGroup,
  resetDataSources,
  saveSource,
  sections,
  setGroupColor,
  toggleGroup,
} from '../../src/application/dataSourceStore';
import type { DataGroup } from '../../src/domain/dataGroup';
import { newConfig, type DataSourceConfig } from '../../src/domain/dataSource';
import { installFakePorts } from '../helpers/ports';

const GROUPS_KEY = 'rustpilot.dataGroups';
const SOURCES_KEY = 'rustpilot.dataSources';
let fakes: ReturnType<typeof installFakePorts>;

const source = (id: string, patch: Partial<DataSourceConfig> = {}): DataSourceConfig => ({
  ...newConfig('sqlite', id),
  name: id,
  filePath: 'C:/x.db',
  ...patch,
});

const made = (name: string): DataGroup => {
  const result = createGroup(name);
  if (typeof result === 'string') throw new Error(result);
  return result;
};

beforeEach(() => {
  fakes = installFakePorts();
  resetDataSources();
});

test('creating a group adds it and remembers it', () => {
  const group = made('Production');
  expect(group).toMatchObject({ name: 'Production', collapsed: false, color: null });
  expect(dataSources.groups.map((g) => g.name)).toEqual(['Production']);
  expect(JSON.parse(fakes.storage.get(GROUPS_KEY) ?? '[]')).toHaveLength(1);
});

test('a bad or duplicate name is refused with a message', () => {
  made('Production');
  expect(createGroup('  ')).toBe('Enter a group name.');
  expect(createGroup('production')).toBe('A group with this name already exists.');
  expect(dataSources.groups).toHaveLength(1);
});

test('renaming validates and keeps the group', () => {
  const a = made('A');
  made('B');
  expect(renameGroup(a.id, 'B')).toBe('A group with this name already exists.');
  expect(renameGroup(a.id, 'A2')).toBeNull();
  expect(dataSources.groups[0].name).toBe('A2');
});

test('color and collapsed state are remembered across a reload', () => {
  const group = made('Prod');
  setGroupColor(group.id, 'red');
  toggleGroup(group.id);
  resetDataSources();
  loadSources();
  expect(dataSources.groups[0]).toMatchObject({ color: 'red', collapsed: true });
});

test('an unknown color is ignored', () => {
  const group = made('Prod');
  setGroupColor(group.id, 'chartreuse');
  expect(dataSources.groups[0].color).toBeNull();
});

test('damaged group storage gives no groups', () => {
  fakes.storage.set(GROUPS_KEY, '{oops');
  loadSources();
  expect(dataSources.groups).toEqual([]);
});

test('sources saved before groups existed load without a group', () => {
  fakes.storage.set(SOURCES_KEY, JSON.stringify([{ id: 'a1', name: 'Old', engine: 'sqlite', filePath: 'C:/o.db', readOnly: false }]));
  loadSources();
  expect(dataSources.sources[0].groupId).toBeNull();
  expect(sections().map((s) => s.group)).toEqual([null]);
});

test('moving a source into a group and out again', async () => {
  const group = made('Prod');
  await saveSource(source('a1'));
  moveSource('a1', group.id);
  expect(sections().map((s) => [s.group?.name ?? null, s.sources.map((x) => x.id)])).toEqual([['Prod', ['a1']]]);
  moveSource('a1', null);
  expect(sections().map((s) => [s.group?.name ?? null, s.sources.map((x) => x.id)])).toEqual([['Prod', []], [null, ['a1']]]);
  expect(JSON.parse(fakes.storage.get(SOURCES_KEY) ?? '[]')[0].groupId).toBeNull();
});

test('moving into a group that does not exist leaves the source ungrouped', async () => {
  await saveSource(source('a1'));
  moveSource('a1', 'ghost');
  expect(dataSources.sources[0].groupId).toBeNull();
});

test('saving a source with a vanished group files it as ungrouped', async () => {
  await saveSource(source('a1', { groupId: 'ghost' }));
  expect(dataSources.sources[0].groupId).toBeNull();
});

test('deleting a group keeps its connections and files them as ungrouped', async () => {
  const group = made('Prod');
  await saveSource(source('a1', { groupId: group.id }));
  await removeGroupConfirmed(group.id);
  expect(dataSources.groups).toEqual([]);
  expect(dataSources.sources.map((s) => [s.id, s.groupId])).toEqual([['a1', null]]);
  const message = fakes.dialog.confirm.mock.calls[0][0] as string;
  expect(message).toContain('Prod');
  expect(message).toContain('1');
});

test('declining the confirmation changes nothing', async () => {
  const group = made('Prod');
  await saveSource(source('a1', { groupId: group.id }));
  fakes.dialog.confirm.mockResolvedValueOnce(false);
  await removeGroupConfirmed(group.id);
  expect(dataSources.groups).toHaveLength(1);
  expect(dataSources.sources[0].groupId).toBe(group.id);
});
