import { Show, type JSX } from 'solid-js';
import { layout, toggleToolWindow } from '../../application/layoutStore';
import { TOOL_WINDOW_SIDE, type ToolWindowId } from '../../domain/layout';
import { MinimizeIcon } from './icons';

export interface ToolWindowProps {
  id: ToolWindowId;
  title: string;
  /** Shown right after the title, e.g. the terminal's tabs. */
  headerExtra?: JSX.Element;
  /** Icon buttons shown before the hide button. */
  actions?: JSX.Element;
  children: JSX.Element;
}

/** A docked panel with a title bar and a hide button. */
export function ToolWindow(props: ToolWindowProps): JSX.Element {
  const side = () => TOOL_WINDOW_SIDE[props.id];
  const style = (): JSX.CSSProperties =>
    side() === 'bottom' ? { height: `${layout.size.bottom}px` } : { width: `${layout.size[side()]}px` };

  return (
    <section class={`tool-window tool-window-${side()} island`} style={style()} aria-label={props.title}>
      <header class="tool-window-header">
        <span class="tool-window-title">{props.title}</span>
        <Show when={props.headerExtra}>
          <div class="tool-window-extra">{props.headerExtra}</div>
        </Show>
        <div class="tool-window-actions">
          {props.actions}
          <button
            type="button"
            class="icon-button"
            title="Hide"
            aria-label={`Hide ${props.title}`}
            onClick={() => toggleToolWindow(props.id)}
          >
            <MinimizeIcon />
          </button>
        </div>
      </header>
      <div class="tool-window-body">{props.children}</div>
    </section>
  );
}
