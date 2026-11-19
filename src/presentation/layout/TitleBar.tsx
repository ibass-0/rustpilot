import { createSignal, onMount, Show, type JSX } from 'solid-js';
import type { WindowControls } from '../../application/ports';
import {
  BranchIcon,
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
  /** The checked-out git branch, or `null` outside a repository. */
  branch: string | null;
  /** Shown centred, e.g. the active file. */
  caption: string | null;
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
 * The custom title bar: logo, project switcher, branch, a centred caption,
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
      <button type="button" class="title-project" title="Open Folder" onClick={() => props.onPickProject()}>
        <Show when={props.projectName} fallback={<span class="title-project-name">Open Folder</span>}>
          {(name) => (
            <>
              <span class="title-project-badge">{name().charAt(0)}</span>
              <span class="title-project-name">{name()}</span>
            </>
          )}
        </Show>
        <ChevronDownIcon size={14} />
      </button>
      <Show when={props.branch}>
        {(branch) => (
          <button type="button" class="title-branch" title={`Git branch: ${branch()}`} onClick={() => props.onShowGit()}>
            <BranchIcon size={14} />
            <span class="title-branch-name">{branch()}</span>
            <ChevronDownIcon size={14} />
          </button>
        )}
      </Show>
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
