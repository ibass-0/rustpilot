import { createSignal, lazy, onCleanup, onMount, Show, Suspense } from 'solid-js';
import { closeOtherTabs, closeSavedTabs, closeTab, editor, openFile, reopenClosedTab, saveDirtyTabs, saveTab } from '../application/editorStore';
import { closeDiff, openDiff } from '../application/diffStore';
import { layout, loadLayout, toggleToolWindow } from '../application/layoutStore';
import type { WindowControls } from '../application/ports';
import {
  collapseAll,
  openWorkspace,
  pickAndAddFolder,
  pickAndOpenWorkspace,
  rediscoverRepositories,
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
import { listRecovery } from '../application/recoveryStore';
import { RecoveryDialog } from './editor/RecoveryDialog';
import { SearchPanel } from './workspace/SearchPanel';
import { SettingsDialog } from './workspace/SettingsDialog';
import { NotificationsPanel } from './workspace/NotificationsPanel';
import { RunPanel } from './workspace/RunPanel';
import { refreshAll } from '../application/gitStore';
import { loadRecent, recent } from '../application/recentStore';
import { loadCommitHistory } from '../application/commitStore';
import { loadDiffPrefs } from '../application/diffStore';
import { dataSources, loadSources } from '../application/dataSourceStore';
import { loadConsoles } from '../application/sqlConsoleStore';
import { AgentPanel } from './agent/AgentPanel';
import { DockerPanel } from './docker/DockerPanel';
import { StructurePanel } from './workspace/StructurePanel';

// The database UI is only loaded once the tool window is opened.
const DatabasePanel = lazy(() => import('./database/DatabasePanel'));
const PasswordPrompt = lazy(() => import('./database/PasswordPrompt'));

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
  const [recovery, setRecovery] = createSignal(listRecovery());
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  loadLayout();
  loadRecent();
  loadSources();
  loadCommitHistory();
  loadDiffPrefs();
  loadConsoles();
  void restoreWorkspace();

  const activeTab = () => editor.tabs.find((tab) => tab.path === editor.activePath) ?? null;
  const projectName = () => {
    if (!workspace.root) return null;
    const first = fileNameOf(workspace.root) || workspace.root;
    return workspace.projects.length > 1 ? `${first} +${workspace.projects.length - 1}` : first;
  };
  const reloadWorkspace = () => void Promise.all([refreshWorkspace(), rediscoverRepositories()]);

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
    { id: 'reopen-tab', label: 'Reopen Closed Tab', run: () => void reopenClosedTab() },
    { id: 'close-other-tabs', label: 'Close Other Tabs', run: () => { if (editor.activePath) void closeOtherTabs(editor.activePath); } },
    { id: 'close-saved-tabs', label: 'Close Saved Tabs', run: () => void closeSavedTabs() },
    { id: 'open-folder', label: 'Open Folder', run: () => void pickAndOpenWorkspace() },
    { id: 'add-folder', label: 'Add Folder to Workspace', run: () => void pickAndAddFolder() },
    { id: 'open-recent-file', label: recent.files[0] ? `Open Recent File: ${fileNameOf(recent.files[0])}` : 'Open Recent File', run: () => { if (recent.files[0]) openProjectFile(recent.files[0]); } },
    { id: 'open-recent-project', label: recent.projects[0] ? `Open Recent Project: ${fileNameOf(recent.projects[0])}` : 'Open Recent Project', run: () => { if (recent.projects[0]) void openWorkspace(recent.projects[0]); } },
    { id: 'find-in-files', label: 'Find in Files', shortcut: 'Ctrl+Shift+F', run: () => showToolWindow('search') },
    { id: 'new-terminal', label: 'Open Terminal', shortcut: 'Alt+F12', run: () => showToolWindow('terminal') },
    { id: 'project-panel', label: 'Show Project Panel', shortcut: 'Alt+1', run: () => showToolWindow('project') },
    { id: 'git-panel', label: 'Show Git Panel', shortcut: 'Alt+9', run: () => showToolWindow('git') },
    { id: 'database-panel', label: 'Show Database Panel', run: () => showToolWindow('database') },
    { id: 'reload-workspace', label: 'Reload Workspace', run: reloadWorkspace },
    { id: 'workspace-settings', label: 'Open Workspace Settings', run: () => setSettingsOpen(true) },
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
    const autosave = () => void saveDirtyTabs();
    window.addEventListener('blur', autosave);
    disposers.push(() => window.removeEventListener('blur', autosave));

    onCleanup(() => disposers.forEach((dispose) => dispose()));
  });

  return (
    <>
    <Shell
      titleBar={
        <TitleBar
          window={props.window}
          projectName={projectName()}
          caption={activeTab()?.name ?? null}
          menu={[
            { label: 'Open Folder…', onSelect: () => void pickAndOpenWorkspace() },
            { label: 'Add Folder to Workspace…', onSelect: () => void pickAndAddFolder() },
            { label: `About ${props.info.name}`, onSelect: () => setAboutOpen(true), separated: true },
          ]}
          onPickProject={() => void pickAndOpenWorkspace()}
          onShowSearch={() => showToolWindow('search')}
        />
      }
      toolWindows={{
        search: { body: () => <SearchPanel onOpen={(path, line) => { openProjectFile(path); /* line navigation follows in the editor navigation slice */ void line; }} /> },
        run: { body: () => <RunPanel /> },
        database: { body: () => <Suspense><DatabasePanel /></Suspense> },
        notifications: { body: () => <NotificationsPanel /> },
        commit: {
          body: () => <CommitPanel onOpenChange={(root, path, staged) => void openDiff(root, path, staged)} onOpenFile={openProjectFile} />,
          actions: () => (
            <button type="button" class="icon-button" title="Refresh Git Status" aria-label="Refresh Git Status" onClick={() => void refreshAll()}>
              <RefreshIcon />
            </button>
          ),
        },
        terminal: {
          body: () => <TerminalPanel surface={props.terminalSurface} />,
          headerExtra: () => <TerminalTabs />,
        },
        project: {
          body: () => <ProjectPanel activePath={editor.activePath} onOpenFile={openProjectFile} />,
          actions: () => (
            <>
              <button
                type="button"
                class="icon-button"
                title="Reload from Disk"
                aria-label="Reload from Disk"
                onClick={reloadWorkspace}
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
        structure: { body: () => <StructurePanel surface={props.editorSurface} /> },
        agent: { body: () => <AgentPanel /> },
      }}
      editor={<Show when={layout.open.right === 'docker'} fallback={<EditorPane surface={props.editorSurface} />}><DockerPanel /></Show>}
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
    <Show when={recovery().length > 0}>
      <RecoveryDialog items={recovery()} onClose={() => setRecovery([])} />
    </Show>
    <Show when={settingsOpen()}><SettingsDialog onClose={() => setSettingsOpen(false)} /></Show>
    <Show when={dataSources.passwordRequest}>
      <Suspense><PasswordPrompt /></Suspense>
    </Show>
    </>
  );
}
