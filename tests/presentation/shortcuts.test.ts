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

test('letters match the character the layout types, not the physical key', () => {
  const closeTab = vi.fn();
  const off = registerShortcut('ctrl+w', closeTab);
  // AZERTY: the key that types "z" sits where QWERTY has W.
  press({ key: 'z', code: 'KeyW', ctrlKey: true });
  expect(closeTab).not.toHaveBeenCalled();
  // ...and the key that types "w" sits where QWERTY has Z.
  press({ key: 'w', code: 'KeyZ', ctrlKey: true });
  expect(closeTab).toHaveBeenCalledTimes(1);
  off();
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

function pressOn(target: Element, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function terminalInput(): HTMLElement {
  const host = document.body.appendChild(document.createElement('div'));
  host.className = 'terminal-host';
  return host.appendChild(document.createElement('textarea'));
}

test('a shortcut with exceptIn is ignored while the key is pressed inside that element', () => {
  const handler = vi.fn();
  const off = registerShortcut('ctrl+w', handler, { exceptIn: '.terminal-host' });
  const event = pressOn(terminalInput(), { key: 'w', code: 'KeyW', ctrlKey: true });
  expect(handler).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);
  off();
});

test('a shortcut with exceptIn still fires elsewhere', () => {
  const handler = vi.fn();
  const off = registerShortcut('ctrl+w', handler, { exceptIn: '.terminal-host' });
  const elsewhere = document.body.appendChild(document.createElement('div'));
  const event = pressOn(elsewhere, { key: 'w', code: 'KeyW', ctrlKey: true });
  expect(handler).toHaveBeenCalledTimes(1);
  expect(event.defaultPrevented).toBe(true);
  off();
});

test('a passThrough shortcut prevents the default but lets the key reach its target', () => {
  const handler = vi.fn();
  const off = registerShortcut('ctrl+r', handler, { passThrough: true });
  const input = terminalInput();
  const received = vi.fn();
  input.addEventListener('keydown', received);
  const event = pressOn(input, { key: 'r', code: 'KeyR', ctrlKey: true });
  expect(handler).toHaveBeenCalledTimes(1);
  expect(event.defaultPrevented).toBe(true);
  expect(received).toHaveBeenCalledTimes(1);
  off();
});

test('an ordinary shortcut does not let the key reach its target', () => {
  const off = registerShortcut('alt+f12', () => {});
  const input = terminalInput();
  const received = vi.fn();
  input.addEventListener('keydown', received);
  pressOn(input, { key: 'F12', code: 'F12', altKey: true });
  expect(received).not.toHaveBeenCalled();
  off();
});
