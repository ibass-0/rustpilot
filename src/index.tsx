/* @refresh reload */
// Composition root: the only place where adapters are wired to the application.
import { render } from 'solid-js/web';
import { configurePorts } from './application/ports';
import { browserStorage } from './infrastructure/storage/localStorage';
import { tauriDialog } from './infrastructure/tauri/dialog';
import { tauriFileSystem } from './infrastructure/tauri/fs';
import App from './presentation/App';
import './presentation/styles/tokens.css';
import './presentation/styles/base.css';

configurePorts({
  fs: tauriFileSystem,
  dialog: tauriDialog,
  storage: browserStorage,
  // Replaced by the CodeMirror buffer store once the editor lands.
  buffers: { open() {}, has: () => false, text: () => '', close() {} },
});

render(() => <App />, document.getElementById('root') as HTMLElement);
