import { Channel } from '@tauri-apps/api/core';
import type { PtyPort } from '../../application/ports';
import { call } from './invoke';

/** What the backend streams for a running terminal. */
type TerminalEvent = { type: 'output'; data: string } | { type: 'exit'; code: number };

/** `PtyPort` backed by the Rust terminal commands; output arrives over a Tauri channel. */
export const tauriPty: PtyPort = {
  listShells: () => call('terminal_shells'),

  async open(id, profileId, cwd, size, onOutput, onExit) {
    const onEvent = new Channel<TerminalEvent>();
    onEvent.onmessage = (event) => {
      if (event.type === 'output') onOutput(event.data);
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

  async close(id) {
    await call<null>('terminal_close', { id });
  },
};
