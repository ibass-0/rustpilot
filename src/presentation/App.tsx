import { onCleanup, onMount } from 'solid-js';
import { closeTab, editor, openFile, saveTab } from '../application/editorStore';
import { loadLayout } from '../application/layoutStore';
import { restoreWorkspace, workspace } from '../application/workspaceStore';
import { EditorPane, type EditorSurface } from './editor/EditorPane';
import { Shell } from './layout/Shell';
import { StatusBar } from './layout/StatusBar';
import { registerShortcut } from './shortcuts';
import { ProjectPanel } from './workspace/ProjectPanel';

export default function App(props: { editorSurface: EditorSurface }) {
  loadLayout();
  void restoreWorkspace();

  const activeTab = () => editor.tabs.find((tab) => tab.path === editor.activePath) ?? null;

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
    onCleanup(() => disposers.forEach((dispose) => dispose()));
  });

  return (
    <Shell
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
