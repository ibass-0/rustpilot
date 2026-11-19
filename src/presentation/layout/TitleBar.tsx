import { createSignal, onMount, Show, type JSX } from 'solid-js';
import type { WindowControls } from '../../application/ports';
import { ChevronDownIcon, CloseIcon, LogoMark, MaximizeIcon, MinimizeIcon, RestoreIcon } from './icons';

export interface TitleBarProps {
  window: WindowControls;
  /** Name of the open folder, or `null` when none is open. */
  projectName: string | null;
  /** Shown centred, e.g. the active file. */
  caption: string | null;
  onPickProject: () => void;
}

/**
 * The custom title bar: logo, project switcher, a centred caption, and the
 * window buttons. Empty areas drag the window; double-clicking them maximises.
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
      <div class="title-center" data-tauri-drag-region>
        {props.caption ?? 'RustPilot'}
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
