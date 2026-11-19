import { onCleanup, onMount } from 'solid-js';
import { closeTab, editor, openFile, saveTab } from '../application/editorStore';
import { loadLayout } from '../application/layoutStore';
import type { WindowControls } from '../application/ports';
import { pickAndOpenWorkspace, refreshWorkspace, restoreWorkspace, workspace } from '../application/workspaceStore';
import { fileNameOf } from '../domain/fs';
import { EditorPane, type EditorSurface } from './editor/EditorPane';
import { Shell } from './layout/Shell';
import { StatusBar } from './layout/StatusBar';
import { TitleBar } from './layout/TitleBar';
import { registerShortcut } from './shortcuts';
import { ProjectPanel } from './workspace/ProjectPanel';

export default function App(props: { editorSurface: EditorSurface; window: WindowControls }) {
  loadLayout();
  void restoreWorkspace();

  const activeTab = () => editor.tabs.find((tab) => tab.path === editor.activePath) ?? null;
  const projectName = () => (workspace.root ? fileNameOf(workspace.root) || workspace.root : null);

  const saveActive = () => {
    if (editor.activePath) void saveTab(editor.activePath);
  };
  const closeActive = () => {
    if (editor.activePath) void closeTab(editor.activePath);
  };

  onMount(() => {
    const disposers = [
      registerShortcut('ctrl+s', saveActive),
      registerShortcut('ctrl+w', closeActive),
      registerShortcut('ctrl+f4', closeActive),
    ];
    // Coming back to the window picks up files created or removed elsewhere.
    const refresh = () => void refreshWorkspace();
    window.addEventListener('focus', refresh);
    disposers.push(() => window.removeEventListener('focus', refresh));

    onCleanup(() => disposers.forEach((dispose) => dispose()));
  });

  return (
    <Shell
      titleBar={
        <TitleBar
          window={props.window}
          projectName={projectName()}
          caption={activeTab()?.name ?? null}
          onPickProject={() => void pickAndOpenWorkspace()}
        />
      }
      project={<ProjectPanel activePath={editor.activePath} onOpenFile={(path) => void openFile(path)} />}
      editor={<EditorPane surface={props.editorSurface} />}
      status={
        <StatusBar
          root={workspace.root}
          fileName={activeTab()?.name ?? null}
          cursor={activeTab() ? editor.cursor : null}
          lineEnding={activeTab()?.lineEnding ?? null}
        />
      }
    />
  );
}
