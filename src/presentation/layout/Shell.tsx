import { onCleanup, onMount, Show, type JSX } from 'solid-js';
import { layout, toggleToolWindow } from '../../application/layoutStore';
import { TOOL_WINDOW_IDS, type Side, type ToolWindowId } from '../../domain/layout';
import { registerShortcut } from '../shortcuts';
import { Splitter } from './Splitter';
import { Stripe } from './Stripe';
import { ToolWindow } from './ToolWindow';
import { TOOL_WINDOWS, ToolWindowPreview } from './toolWindows';

/**
 * What a built tool window puts into its panel. Tool windows without a slot
 * show a preview. Each part is a function so that it is only created when the
 * tool window is actually opened: a closed Terminal must not start a shell.
 */
export interface ToolWindowSlot {
  body: () => JSX.Element;
  headerExtra?: () => JSX.Element;
  actions?: () => JSX.Element;
}

export interface ShellProps {
  titleBar: JSX.Element;
  editor: JSX.Element;
  status: JSX.Element;
  toolWindows: Partial<Record<ToolWindowId, ToolWindowSlot>>;
}

/**
 * The application frame. Panels are rounded "islands" on the frame colour:
 * a left, an editor and a right island sit side by side, the bottom island
 * runs beneath all three, and the tool window stripes, title bar and status
 * bar live directly on the frame. Each side shows one tool window at a time.
 */
export function Shell(props: ShellProps): JSX.Element {
  onMount(() => {
    const disposers = TOOL_WINDOW_IDS.flatMap((id) => {
      const shortcut = TOOL_WINDOWS[id].shortcut;
      return shortcut ? [registerShortcut(shortcut, () => toggleToolWindow(id))] : [];
    });
    onCleanup(() => disposers.forEach((dispose) => dispose()));
  });

  const panel = (side: Side) => (
    <Show when={layout.open[side]} keyed>
      {(id) => {
        const info = TOOL_WINDOWS[id];
        const slot = props.toolWindows[id];
        return (
          <ToolWindow id={id} title={info.title} headerExtra={slot?.headerExtra?.()} actions={slot?.actions?.()}>
            {slot ? slot.body() : <ToolWindowPreview info={info} />}
          </ToolWindow>
        );
      }}
    </Show>
  );

  return (
    <div class="shell">
      {props.titleBar}
      <div class="shell-body">
        <Stripe side="left" />
        <div class="shell-main">
          <div class="shell-upper">
            {panel('left')}
            <Show when={layout.open.left}>
              <Splitter side="left" />
            </Show>
            <main class="shell-editor island">{props.editor}</main>
            <Show when={layout.open.right}>
              <Splitter side="right" />
            </Show>
            {panel('right')}
          </div>
          <Show when={layout.open.bottom}>
            <Splitter side="bottom" />
          </Show>
          {panel('bottom')}
        </div>
        <Stripe side="right" />
      </div>
      {props.status}
    </div>
  );
}
