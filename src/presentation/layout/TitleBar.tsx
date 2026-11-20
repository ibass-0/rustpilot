import { createSignal, onMount, type JSX } from 'solid-js';
import type { WindowControls } from '../../application/ports';
import { RepositoryButton } from '../git/RepositoryButton';
import { MainMenu, type MenuItem } from './MainMenu';
import {
  BugIcon,
  ChevronDownIcon,
  CloseIcon,
  GearIcon,
  LogoMark,
  MaximizeIcon,
  MinimizeIcon,
  PlayIcon,
  RestoreIcon,
  SearchIcon,
} from './icons';

export interface TitleBarProps {
  window: WindowControls;
  /** Name of the open folder, or `null` when none is open. */
  projectName: string | null;
  /** Shown centred, e.g. the active file. */
  caption: string | null;
  /** Entries of the application menu. */
  menu: MenuItem[];
  onPickProject: () => void;
  onShowGit: () => void;
  onShowSearch: () => void;
}

/** A control whose feature is not built yet: visible, dimmed, and explained by its tooltip. */
function Upcoming(props: { label: string; children: JSX.Element; class?: string }): JSX.Element {
  return (
    <span
      class={`title-button is-upcoming ${props.class ?? ''}`}
      role="button"
      aria-disabled="true"
      aria-label={props.label}
      title={`${props.label} — coming in a later phase`}
    >
      {props.children}
    </span>
  );
}

/**
 * The custom title bar: logo, application menu, project switcher, branch, a centred caption,
 * the run controls, search, settings and the window buttons. Empty areas
 * drag the window; double-clicking them maximises.
 */
export function TitleBar(props: TitleBarProps): JSX.Element {
  const [maximized, setMaximized] = createSignal(false);

  onMount(() => {
    const sync = () => void props.window.isMaximized().then(setMaximized, () => {});
    sync();
    props.window.onResized(sync);
  });

  return (
    <header class="title-bar" data-tauri-drag-region>
      <span class="title-logo">
        <LogoMark size={20} />
      </span>
      <MainMenu items={props.menu} />
      <RepositoryButton onShowGit={() => props.onShowGit()} />
      <div class="title-center" data-tauri-drag-region>
        {props.caption ?? 'RustPilot'}
      </div>
      <div class="title-tools">
        <Upcoming label="Run configuration" class="title-run">
          <span>Current File</span>
          <ChevronDownIcon size={14} />
        </Upcoming>
        <Upcoming label="Run">
          <PlayIcon />
        </Upcoming>
        <Upcoming label="Debug">
          <BugIcon />
        </Upcoming>
        <span class="title-divider" />
        <button
          type="button"
          class="title-button"
          title="Find in Files (Ctrl+Shift+F)"
          aria-label="Find in Files"
          onClick={() => props.onShowSearch()}
        >
          <SearchIcon />
        </button>
        <Upcoming label="Settings">
          <GearIcon />
        </Upcoming>
      </div>
      <div class="window-controls">
        <button type="button" class="window-control" aria-label="Minimize" onClick={() => props.window.minimize()}>
          <MinimizeIcon />
        </button>
        <button
          type="button"
          class="window-control"
          aria-label={maximized() ? 'Restore' : 'Maximize'}
          onClick={() => props.window.toggleMaximize()}
        >
          {maximized() ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          type="button"
          class="window-control window-control-close"
          aria-label="Close"
          onClick={() => props.window.close()}
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  );
}
