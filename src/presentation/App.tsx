import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { closeTab, editor, openFile, saveTab } from '../application/editorStore';
import { layout, loadLayout, toggleToolWindow } from '../application/layoutStore';
import type { WindowControls } from '../application/ports';
import {
  collapseAll,
  pickAndOpenWorkspace,
  refreshWorkspace,
  restoreWorkspace,
  workspace,
} from '../application/workspaceStore';
import type { AppInfo } from '../domain/appInfo';
import { fileNameOf } from '../domain/fs';
import { TOOL_WINDOW_SIDE, type ToolWindowId } from '../domain/layout';
import { AboutDialog } from './about/AboutDialog';
import { EditorPane, type EditorSurface } from './editor/EditorPane';
import { CollapseAllIcon, RefreshIcon } from './layout/icons';
import { Shell } from './layout/Shell';
import { StatusBar } from './layout/StatusBar';
import { TitleBar } from './layout/TitleBar';
import { registerShortcut } from './shortcuts';
import { ProjectPanel } from './workspace/ProjectPanel';

/** Open a tool window if it is not already showing; never closes it. */
function showToolWindow(id: ToolWindowId): void {
  if (layout.open[TOOL_WINDOW_SIDE[id]] !== id) toggleToolWindow(id);
}

export default function App(props: { editorSurface: EditorSurface; window: WindowControls; info: AppInfo }) {
  const [aboutOpen, setAboutOpen] = createSignal(false);
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
    <>
    <Shell
      titleBar={
        <TitleBar
          window={props.window}
          projectName={projectName()}
          branch={workspace.branch}
          caption={activeTab()?.name ?? null}
          menu={[
            { label: 'Open Folder…', onSelect: () => void pickAndOpenWorkspace() },
            { label: `About ${props.info.name}`, onSelect: () => setAboutOpen(true), separated: true },
          ]}
          onPickProject={() => void pickAndOpenWorkspace()}
          onShowGit={() => showToolWindow('git')}
          onShowSearch={() => showToolWindow('search')}
        />
      }
      toolWindows={{
        project: {
          body: <ProjectPanel activePath={editor.activePath} onOpenFile={(path) => void openFile(path)} />,
          actions: (
            <>
              <button
                type="button"
                class="icon-button"
                title="Reload from Disk"
                aria-label="Reload from Disk"
                onClick={() => void refreshWorkspace()}
              >
                <RefreshIcon />
              </button>
              <button
                type="button"
                class="icon-button"
                title="Collapse All"
                aria-label="Collapse All"
                onClick={() => collapseAll()}
              >
                <CollapseAllIcon />
              </button>
            </>
          ),
        },
      }}
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
    <Show when={aboutOpen()}>
      <AboutDialog info={props.info} onClose={() => setAboutOpen(false)} />
    </Show>
    </>
  );
}
