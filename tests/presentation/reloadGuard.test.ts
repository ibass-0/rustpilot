import { beforeAll, expect, test } from 'vitest';
import { installReloadGuard } from '../../src/presentation/reloadGuard';

beforeAll(() => {
  installReloadGuard();
});

function press(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

function contextMenuOn(target: Element): MouseEvent {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

test.each([
  ['F5', { key: 'F5', code: 'F5' }],
  ['Ctrl+F5', { key: 'F5', code: 'F5', ctrlKey: true }],
  ['Ctrl+R', { key: 'r', code: 'KeyR', ctrlKey: true }],
  ['Ctrl+Shift+R', { key: 'R', code: 'KeyR', ctrlKey: true, shiftKey: true }],
])('%s cannot reload the page', (_name, init) => {
  expect(press(init).defaultPrevented).toBe(true);
});

test('the browser context menu, which offers Refresh, is suppressed outside the editor', () => {
  const panel = document.body.appendChild(document.createElement('div'));
  expect(contextMenuOn(panel).defaultPrevented).toBe(true);
});

test('the context menu still works inside the editor', () => {
  const editorRoot = document.body.appendChild(document.createElement('div'));
  editorRoot.className = 'cm-editor';
  const line = editorRoot.appendChild(document.createElement('div'));
  expect(contextMenuOn(line).defaultPrevented).toBe(false);
});
