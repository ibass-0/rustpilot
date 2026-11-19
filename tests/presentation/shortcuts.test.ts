import { expect, test, vi } from 'vitest';
import { registerShortcut } from '../../src/presentation/shortcuts';

function press(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

test('fires the handler for a matching combo and prevents the default', () => {
  const handler = vi.fn();
  const off = registerShortcut('ctrl+s', handler);
  const event = press({ key: 's', code: 'KeyS', ctrlKey: true });
  expect(handler).toHaveBeenCalledTimes(1);
  expect(event.defaultPrevented).toBe(true);
  off();
});

test('ignores the key when modifiers differ', () => {
  const handler = vi.fn();
  const off = registerShortcut('ctrl+s', handler);
  press({ key: 's', code: 'KeyS' });
  press({ key: 's', code: 'KeyS', ctrlKey: true, shiftKey: true });
  expect(handler).not.toHaveBeenCalled();
  off();
});

test('matches digits by physical key and function keys by name', () => {
  const digit = vi.fn();
  const fn = vi.fn();
  const offDigit = registerShortcut('alt+1', digit);
  const offFn = registerShortcut('Alt+F12', fn);
  press({ key: '¡', code: 'Digit1', altKey: true });
  press({ key: 'F12', code: 'F12', altKey: true });
  expect(digit).toHaveBeenCalledTimes(1);
  expect(fn).toHaveBeenCalledTimes(1);
  offDigit();
  offFn();
});

test('the returned function unregisters the shortcut', () => {
  const handler = vi.fn();
  registerShortcut('ctrl+w', handler)();
  const event = press({ key: 'w', code: 'KeyW', ctrlKey: true });
  expect(handler).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);
});

test('a held-down key does not fire the handler again', () => {
  const handler = vi.fn();
  const off = registerShortcut('ctrl+s', handler);
  const event = press({ key: 's', code: 'KeyS', ctrlKey: true, repeat: true });
  expect(handler).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(true);
  off();
});
