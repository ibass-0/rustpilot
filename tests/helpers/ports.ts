import { vi } from 'vitest';
import { configurePorts, type BufferPort, type StoragePort } from '../../src/application/ports';

/** An in-memory `BufferPort` that normalises line breaks the way the editor does. */
function memoryBuffers(): BufferPort {
  const docs = new Map<string, string>();
  return {
    open: (path, text) => void docs.set(path, text.replace(/\r\n/g, '\n')),
    has: (path) => docs.has(path),
    text: (path) => docs.get(path) ?? '',
    close: (path) => void docs.delete(path),
  };
}

function memoryStorage(): StoragePort {
  const values = new Map<string, string>();
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  };
}

/** Configure the application with fresh fakes and return them for assertions. */
export function installFakePorts() {
  const fakes = {
    fs: {
      listDir: vi.fn().mockResolvedValue([]),
      readTextFile: vi.fn().mockResolvedValue({ text: '', lineEnding: 'lf' }),
      writeTextFile: vi.fn().mockResolvedValue(undefined),
    },
    dialog: {
      pickFolder: vi.fn().mockResolvedValue(null),
      confirmDiscard: vi.fn().mockResolvedValue(true),
      showError: vi.fn().mockResolvedValue(undefined),
    },
    storage: memoryStorage(),
    buffers: memoryBuffers(),
  };
  configurePorts(fakes);
  return fakes;
}
