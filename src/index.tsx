/* @refresh reload */
// Composition root: the only place where adapters are wired to the application.
import { render } from 'solid-js/web';
import { confirmWindowClose, markDirty, setCursor } from './application/editorStore';
import { configurePorts } from './application/ports';
import { createCodemirrorBuffers } from './infrastructure/codemirror/buffers';
import { baseExtensions } from './infrastructure/codemirror/extensions';
import { browserStorage } from './infrastructure/storage/localStorage';
import { tauriDialog } from './infrastructure/tauri/dialog';
import { tauriFileSystem } from './infrastructure/tauri/fs';
import { guardWindowClose } from './infrastructure/tauri/window';
import App from './presentation/App';
import './presentation/styles/tokens.css';
import './presentation/styles/base.css';
import './presentation/styles/workspace.css';
import './presentation/styles/editor.css';

const buffers = createCodemirrorBuffers((path) => baseExtensions(() => markDirty(path), setCursor));

configurePorts({
  fs: tauriFileSystem,
  dialog: tauriDialog,
  storage: browserStorage,
  buffers,
});

guardWindowClose(confirmWindowClose);

render(() => <App editorSurface={buffers} />, document.getElementById('root') as HTMLElement);
