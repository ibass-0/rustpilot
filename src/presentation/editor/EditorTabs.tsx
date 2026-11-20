import { For, type JSX } from 'solid-js';
import { activateTab, closeTab, editor, togglePin } from '../../application/editorStore';
import type { Tab } from '../../domain/editor';
import { FileTypeIcon } from '../icons/FileTypeIcon';
import { CloseIcon } from '../layout/icons';

const MIDDLE_BUTTON = 1;

function EditorTab(props: { tab: Tab }): JSX.Element {
  const active = () => editor.activePath === props.tab.path;

  return (
    <div
      class="tab"
      role="tab"
      aria-selected={active()}
      title={props.tab.path}
      onClick={() => activateTab(props.tab.path)}
      onDblClick={() => togglePin(props.tab.path)}
      onMouseDown={(event) => {
        // Stop the middle button from starting autoscroll; it closes the tab instead.
        if (event.button === MIDDLE_BUTTON) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button === MIDDLE_BUTTON) void closeTab(props.tab.path);
      }}
    >
      <span class="tab-icon">
        <FileTypeIcon name={props.tab.name} size={15} />
      </span>
      <span class="tab-name">{props.tab.name}</span>
      <span class="tab-pin" aria-label={props.tab.pinned ? 'Pinned' : undefined}>{props.tab.pinned ? '•' : ''}</span>
      <span class="tab-dirty" aria-label={props.tab.dirty ? 'Unsaved changes' : undefined}>
        {props.tab.dirty ? '●' : ''}
      </span>
      <button
        type="button"
        class="tab-close"
        title="Close (Ctrl+W)"
        aria-label={`Close ${props.tab.name}`}
        onClick={(event) => {
          event.stopPropagation();
          void closeTab(props.tab.path);
        }}
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
}

export function EditorTabs(): JSX.Element {
  return (
    <div class="tabs" role="tablist">
      <For each={editor.tabs}>{(tab) => <EditorTab tab={tab} />}</For>
    </div>
  );
}
