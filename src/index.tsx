/* @refresh reload */
// Composition root: the only place where adapters are wired to the application.
import { render } from 'solid-js/web';
import packageInfo from '../package.json';
import { confirmWindowClose, markDirty, setCursor } from './application/editorStore';
import { configurePorts } from './application/ports';
import { appInfo } from './domain/appInfo';
import { createCodemirrorBuffers } from './infrastructure/codemirror/buffers';
import { baseExtensions } from './infrastructure/codemirror/extensions';
import { iconUrl, materialManifest } from './infrastructure/material/icons';
import { browserStorage } from './infrastructure/storage/localStorage';
import { tauriDialog } from './infrastructure/tauri/dialog';
import { tauriFileSystem } from './infrastructure/tauri/fs';
import { tauriPty } from './infrastructure/tauri/pty';
import { guardWindowClose, tauriWindowControls } from './infrastructure/tauri/window';
import { createXtermScreens } from './infrastructure/xterm/screens';
import App from './presentation/App';
import { configureIconTheme } from './presentation/icons/FileTypeIcon';
import { installReloadGuard } from './presentation/reloadGuard';
import './presentation/styles/tokens.css';
import './presentation/styles/base.css';
import './presentation/styles/workspace.css';
import './presentation/styles/editor.css';
import './presentation/styles/overlay.css';

const screens = createXtermScreens();
const buffers = createCodemirrorBuffers((path) => baseExtensions(() => markDirty(path), setCursor));

configurePorts({
  fs: tauriFileSystem,
  dialog: tauriDialog,
  storage: browserStorage,
  buffers,
  pty: tauriPty,
  screens,
});

configureIconTheme({ manifest: materialManifest, url: iconUrl });
guardWindowClose(confirmWindowClose);
installReloadGuard();

render(() => <App editorSurface={buffers} window={tauriWindowControls} info={appInfo(packageInfo.version)} />, document.getElementById('root') as HTMLElement);
