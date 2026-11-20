import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { closeTab, editor, openFile, saveTab } from '../application/editorStore';
import { closeDiff, openDiff } from '../application/diffStore';
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
import { CommitPanel } from './git/CommitPanel';
import { EditorPane, type EditorSurface } from './editor/EditorPane';
import { TerminalPanel, TerminalTabs, type TerminalSurface } from './terminal/TerminalPanel';
import { CollapseAllIcon, RefreshIcon } from './layout/icons';
import { Shell } from './layout/Shell';
import { StatusBar } from './layout/StatusBar';
import { TitleBar } from './layout/TitleBar';
import { registerShortcut } from './shortcuts';
import { ProjectPanel } from './workspace/ProjectPanel';
import { CommandPalette, type PaletteCommand } from './commandPalette';
import { QuickOpen } from './workspace/QuickOpen';

/** Open a tool window if it is not already showing; never closes it. */
function showToolWindow(id: ToolWindowId): void {
  if (layout.open[TOOL_WINDOW_SIDE[id]] !== id) toggleToolWindow(id);
}

/** Where the terminal keeps these keys for the shell instead of the editor. */
const TERMINAL_AREA = '.terminal-host';

export default function App(props: {
  editorSurface: EditorSurface;
  terminalSurface: TerminalSurface;
  window: WindowControls;
  info: AppInfo;
}) {
  const [aboutOpen, setAboutOpen] = createSignal(false);
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const [quickOpenVisible, setQuickOpenVisible] = createSignal(false);
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
  const openProjectFile = (path: string) => {
    closeDiff();
    void openFile(path);
  };
  const commands = (): PaletteCommand[] => [
    { id: 'save-file', label: 'Save File', shortcut: 'Ctrl+S', run: saveActive },
    { id: 'close-tab', label: 'Close Tab', shortcut: 'Ctrl+W', run: closeActive },
    { id: 'open-folder', label: 'Open Folder', run: () => void pickAndOpenWorkspace() },
    { id: 'find-in-files', label: 'Find in Files', shortcut: 'Ctrl+Shift+F', run: () => showToolWindow('search') },
    { id: 'new-terminal', label: 'Open Terminal', shortcut: 'Alt+F12', run: () => showToolWindow('terminal') },
    { id: 'project-panel', label: 'Show Project Panel', shortcut: 'Alt+1', run: () => showToolWindow('project') },
    { id: 'git-panel', label: 'Show Git Panel', shortcut: 'Alt+9', run: () => showToolWindow('git') },
    { id: 'reload-workspace', label: 'Reload Workspace', run: () => void refreshWorkspace() },
    { id: 'about', label: `About ${props.info.name}`, run: () => setAboutOpen(true) },
  ];

  onMount(() => {
    const disposers = [
      registerShortcut('ctrl+s', saveActive, { exceptIn: TERMINAL_AREA }),
      registerShortcut('ctrl+w', closeActive, { exceptIn: TERMINAL_AREA }),
      registerShortcut('ctrl+f4', closeActive, { exceptIn: TERMINAL_AREA }),
      registerShortcut('ctrl+shift+p', () => setPaletteOpen(true), { exceptIn: TERMINAL_AREA }),
      registerShortcut('ctrl+p', () => setQuickOpenVisible(true), { exceptIn: TERMINAL_AREA }),
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
        commit: {
          body: () => <CommitPanel onOpenChange={(path, staged) => void (workspace.root && openDiff(workspace.root, path, staged))} />,
          actions: () => (
            <button type="button" class="icon-button" title="Refresh Git Status" aria-label="Refresh Git Status" onClick={() => void refreshWorkspace()}>
              <RefreshIcon />
            </button>
          ),
        },
        terminal: {
          body: () => <TerminalPanel surface={props.terminalSurface} />,
          headerExtra: () => <TerminalTabs />,
        },
        project: {
          body: () => <ProjectPanel activePath={editor.activePath} onOpenFile={openProjectFile} onOpenChange={(path, staged) => void (workspace.root && openDiff(workspace.root, path, staged))} />,
          actions: () => (
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
    <Show when={paletteOpen()}>
      <CommandPalette commands={commands()} onClose={() => setPaletteOpen(false)} />
    </Show>
    <Show when={quickOpenVisible()}>
      <QuickOpen onClose={() => setQuickOpenVisible(false)} onOpen={openProjectFile} />
    </Show>
    </>
  );
}
