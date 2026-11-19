import { onCleanup, onMount, Show, type JSX } from 'solid-js';
import { AgentIcon, FolderIcon, TerminalIcon } from './icons';
import { layout, toggleToolWindow } from '../../application/layoutStore';
import { registerShortcut } from '../shortcuts';
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
 * The application frame: tool window stripes on both edges, dockable left,
 * right and bottom panels around the editor, and a full-width status bar.
 */
export function Shell(props: { project: JSX.Element; editor: JSX.Element; status: JSX.Element }): JSX.Element {
  onMount(() => {
    const disposers = [PROJECT, AGENT, TERMINAL].map((item) =>
      registerShortcut(item.shortcut, () => toggleToolWindow(item.id)),
    );
    onCleanup(() => disposers.forEach((dispose) => dispose()));
  });

  return (
    <div class="shell">
      <div class="shell-body">
        <Stripe side="left" top={[PROJECT]} bottom={[TERMINAL]} />
        <Show when={layout.open.left === 'project'}>
          <ToolWindow id="project" title="Project">
            {props.project}
          </ToolWindow>
          <Splitter side="left" />
        </Show>
        <div class="shell-center">
          <div class="shell-upper">
            <main class="shell-editor">{props.editor}</main>
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
