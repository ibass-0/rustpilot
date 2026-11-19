import { createSignal } from 'solid-js';
import { expect, test } from 'vitest';

test('solid reactivity works in tests', () => {
  const [n, setN] = createSignal(1);
  setN(2);
  expect(n()).toBe(2);
});
