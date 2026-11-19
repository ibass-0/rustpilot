import type { JSX } from 'solid-js';
import { MinimizeIcon } from './icons';
import { layout, toggleToolWindow } from '../../application/layoutStore';
import { TOOL_WINDOW_SIDE, type ToolWindowId } from '../../domain/layout';

/** A docked panel with a title bar and a hide button. */
export function ToolWindow(props: { id: ToolWindowId; title: string; children: JSX.Element }): JSX.Element {
  const side = () => TOOL_WINDOW_SIDE[props.id];
  const style = (): JSX.CSSProperties =>
    side() === 'bottom' ? { height: `${layout.size.bottom}px` } : { width: `${layout.size[side()]}px` };

  return (
    <section class={`tool-window tool-window-${side()}`} style={style()} aria-label={props.title}>
      <header class="tool-window-header">
        <span class="tool-window-title">{props.title}</span>
        <button
          type="button"
          class="icon-button"
          title="Hide"
          aria-label={`Hide ${props.title}`}
          onClick={() => toggleToolWindow(props.id)}
        >
          <MinimizeIcon />
        </button>
      </header>
      <div class="tool-window-body">{props.children}</div>
    </section>
  );
}
