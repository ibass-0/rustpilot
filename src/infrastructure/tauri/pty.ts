import { Channel } from '@tauri-apps/api/core';
import type { PtyPort } from '../../application/ports';
import { call } from './invoke';

/** What the backend streams for a running terminal. */
type TerminalEvent = { type: 'output'; data: string; seq: number } | { type: 'exit'; code: number };

/**
 * `PtyPort` backed by the Rust terminal commands; output arrives over a Tauri
 * channel. Create it once per page load: it first ends any shells a previous
 * page left running (after a reload the backend still holds them, and their
 * ids would collide with this page's), and no shell opens before that is done.
 */
export function createTauriPty(): PtyPort {
  const staleSessionsClosed = call<null>('terminal_close_all').then(
    () => undefined,
    () => undefined,
  );

  return {
    listShells: () => call('terminal_shells'),

    async open(id, profileId, cwd, size, onOutput, onExit) {
      await staleSessionsClosed;
      const onEvent = new Channel<TerminalEvent>();
      onEvent.onmessage = (event) => {
        if (event.type === 'output') onOutput(event.data, event.seq);
        else onExit(event.code);
      };
      await call<null>('terminal_open', { id, profileId, cwd, cols: size.cols, rows: size.rows, onEvent });
    },

    async write(id, data) {
      await call<null>('terminal_write', { id, data });
    },

    async resize(id, size) {
      await call<null>('terminal_resize', { id, cols: size.cols, rows: size.rows });
    },

    async acknowledge(id, seq) {
      await call<null>('terminal_acknowledge', { id, seq });
    },

    async close(id) {
      await call<null>('terminal_close', { id });
    },
  };
}
