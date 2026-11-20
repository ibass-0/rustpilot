/* @refresh reload */
// Composition root: the only place where adapters are wired to the application.
import { render } from 'solid-js/web';
import packageInfo from '../package.json';
import { confirmWindowClose, markDirty, setCursor } from './application/editorStore';
import { configurePorts } from './application/ports';
import { isSqlFile, runFile } from './application/sqlConsoleStore';
import { appInfo } from './domain/appInfo';
import { createCodemirrorBuffers } from './infrastructure/codemirror/buffers';
import { baseExtensions } from './infrastructure/codemirror/extensions';
import { iconUrl, materialManifest } from './infrastructure/material/icons';
import { browserStorage } from './infrastructure/storage/localStorage';
import { tauriDataSource } from './infrastructure/tauri/dataSource';
import { tauriDialog } from './infrastructure/tauri/dialog';
import { tauriDocker } from './infrastructure/tauri/docker';
import { tauriFileSystem } from './infrastructure/tauri/fs';
import { tauriGit } from './infrastructure/tauri/git';
import { createTauriPty } from './infrastructure/tauri/pty';
import { guardWindowClose, tauriWindowControls } from './infrastructure/tauri/window';
import { createXtermScreens } from './infrastructure/xterm/screens';
import App from './presentation/App';
import { configureIconTheme } from './presentation/icons/FileTypeIcon';
import { installReloadGuard } from './presentation/reloadGuard';
import { configureDiffSurface } from './presentation/editor/diffSurface';
import { mergeViewSurface } from './infrastructure/codemirror/mergeView';
import './presentation/styles/tokens.css';
import './presentation/styles/base.css';
import './presentation/styles/workspace.css';
import './presentation/styles/editor.css';
import './presentation/styles/overlay.css';
import './presentation/styles/terminal.css';
import './presentation/styles/git.css';

const screens = createXtermScreens();
const buffers = createCodemirrorBuffers((path) =>
  baseExtensions(
    () => markDirty(path),
    setCursor,
    (all) => {
      if (!isSqlFile(path)) return false;
      void runFile(path, all);
      return true;
    },
  ),
);

configurePorts({
  fs: tauriFileSystem,
  dialog: tauriDialog,
  storage: browserStorage,
  buffers,
  git: tauriGit,
  dataSource: tauriDataSource,
  docker: tauriDocker,
  pty: createTauriPty(),
  screens,
});

configureDiffSurface(mergeViewSurface);
configureIconTheme({ manifest: materialManifest, url: iconUrl });
guardWindowClose(confirmWindowClose);
installReloadGuard();

render(() => <App editorSurface={buffers} terminalSurface={screens} window={tauriWindowControls} info={appInfo(packageInfo.version)} />, document.getElementById('root') as HTMLElement);

// The static splash lives in index.html so it is visible before the JS bundle
// and SolidJS application have finished loading.
const startupSplash = document.getElementById('startup-splash');
if (startupSplash) {
  startupSplash.classList.add('is-hidden');
  window.setTimeout(() => startupSplash.remove(), 220);
}
