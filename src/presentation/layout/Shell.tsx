import { onCleanup, onMount, Show, type JSX } from 'solid-js';
import { layout, toggleToolWindow } from '../../application/layoutStore';
import { registerShortcut } from '../shortcuts';
import { AgentIcon, FolderIcon, TerminalIcon } from './icons';
import { Splitter } from './Splitter';
import { Stripe, type StripeItem } from './Stripe';
import { ToolWindow } from './ToolWindow';

const PROJECT: StripeItem = { id: 'project', label: 'Project', shortcut: 'Alt+1', icon: () => <FolderIcon size={18} /> };
const AGENT: StripeItem = { id: 'agent', label: 'AI Agent', shortcut: 'Alt+2', icon: () => <AgentIcon size={18} /> };
const TERMINAL: StripeItem = {
  id: 'terminal',
  label: 'Terminal',
  shortcut: 'Alt+F12',
  icon: () => <TerminalIcon size={18} />,
};

/**
 * The application frame. Panels are rounded "islands" on the frame colour:
 * the Project, editor and AI Agent islands sit side by side, the Terminal
 * island runs beneath all three, and the tool window stripes, title bar and
 * status bar live directly on the frame.
 */
export function Shell(props: {
  titleBar: JSX.Element;
  project: JSX.Element;
  editor: JSX.Element;
  status: JSX.Element;
}): JSX.Element {
  onMount(() => {
    const disposers = [PROJECT, AGENT, TERMINAL].map((item) =>
      registerShortcut(item.shortcut, () => toggleToolWindow(item.id)),
    );
    onCleanup(() => disposers.forEach((dispose) => dispose()));
  });

  return (
    <div class="shell">
      {props.titleBar}
      <div class="shell-body">
        <Stripe side="left" top={[PROJECT]} bottom={[TERMINAL]} />
        <div class="shell-main">
          <div class="shell-upper">
            <Show when={layout.open.left === 'project'}>
              <ToolWindow id="project" title="Project">
                {props.project}
              </ToolWindow>
              <Splitter side="left" />
            </Show>
            <main class="shell-editor island">{props.editor}</main>
            <Show when={layout.open.right === 'agent'}>
              <Splitter side="right" />
              <ToolWindow id="agent" title="AI Agent">
                <div class="empty-state">
                  <AgentIcon size={28} />
                  <span>The AI agent arrives in a later phase.</span>
                </div>
              </ToolWindow>
            </Show>
          </div>
          <Show when={layout.open.bottom === 'terminal'}>
            <Splitter side="bottom" />
            <ToolWindow id="terminal" title="Terminal">
              <div class="empty-state">
                <TerminalIcon size={28} />
                <span>The terminal arrives in a later phase.</span>
              </div>
            </ToolWindow>
          </Show>
        </div>
        <Stripe side="right" top={[AGENT]} />
      </div>
      {props.status}
    </div>
  );
}
