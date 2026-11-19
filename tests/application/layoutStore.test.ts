import { beforeEach, expect, test } from 'vitest';
import { layout, loadLayout, setPanelSize, toggleToolWindow } from '../../src/application/layoutStore';
import type { StoragePort } from '../../src/application/ports';
import { DEFAULT_LAYOUT } from '../../src/domain/layout';
import { installFakePorts } from '../helpers/ports';

const KEY = 'rustpilot.layout.v1';
let storage: StoragePort;

beforeEach(() => {
  storage = installFakePorts().storage;
  loadLayout();
});

test('defaults: project open on the left', () => {
  expect(layout.open).toEqual({ left: 'project', right: null, bottom: null });
  expect(layout.size).toEqual({ left: 280, right: 360, bottom: 240 });
});

test('toggle closes an open tool window and reopens it', () => {
  toggleToolWindow('project');
  expect(layout.open.left).toBeNull();
  toggleToolWindow('project');
  expect(layout.open.left).toBe('project');
});

test('toggle opens agent on the right without touching other sides', () => {
  toggleToolWindow('agent');
  expect(layout.open).toEqual({ left: 'project', right: 'agent', bottom: null });
});

test('setPanelSize clamps to min and max', () => {
  setPanelSize('left', 10, 700);
  expect(layout.size.left).toBe(160);
  setPanelSize('left', 9999, 700);
  expect(layout.size.left).toBe(700);
});

test('layout persists and reloads', () => {
  toggleToolWindow('terminal');
  setPanelSize('bottom', 300, 600);
  loadLayout();
  expect(layout.open.bottom).toBe('terminal');
  expect(layout.size.bottom).toBe(300);
});

test('corrupt storage falls back to defaults', () => {
  storage.set(KEY, '{not json');
  loadLayout();
  expect(layout).toEqual(DEFAULT_LAYOUT);
});

test('wrong-shape storage falls back to defaults', () => {
  storage.set(KEY, JSON.stringify({ open: { left: 'nope' }, size: { left: 'x' } }));
  loadLayout();
  expect(layout).toEqual(DEFAULT_LAYOUT);
});

test('a tool window stored on the wrong side falls back to defaults', () => {
  storage.set(
    KEY,
    JSON.stringify({ open: { left: 'agent', right: null, bottom: null }, size: { left: 280, right: 360, bottom: 240 } }),
  );
  loadLayout();
  expect(layout).toEqual(DEFAULT_LAYOUT);
});
