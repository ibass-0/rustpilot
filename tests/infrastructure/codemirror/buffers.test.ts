import { expect, test } from 'vitest';
import { createCodemirrorBuffers } from '../../../src/infrastructure/codemirror/buffers';

const A = 'C:\\p\\a.ts';

test('open stores the document and reads it back with LF line breaks', () => {
  const buffers = createCodemirrorBuffers(() => []);
  buffers.open(A, 'x\r\ny\r\n');
  expect(buffers.has(A)).toBe(true);
  expect(buffers.text(A)).toBe('x\ny\n');
});

test('close drops the document', () => {
  const buffers = createCodemirrorBuffers(() => []);
  buffers.open(A, 'x');
  buffers.close(A);
  expect(buffers.has(A)).toBe(false);
  expect(buffers.text(A)).toBe('');
});

test('each buffer is built with the extensions for its own path', () => {
  const seen: string[] = [];
  const buffers = createCodemirrorBuffers((path) => {
    seen.push(path);
    return [];
  });
  buffers.open(A, '');
  expect(seen).toEqual([A]);
});
