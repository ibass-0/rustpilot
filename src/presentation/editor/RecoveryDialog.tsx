import { For, type JSX } from 'solid-js';
import type { RecoveryItem } from '../../application/recoveryStore';
import { restoreRecovered } from '../../application/editorStore';
import { removeRecovery } from '../../application/recoveryStore';
import { fileNameOf } from '../../domain/fs';

export function RecoveryDialog(props: { items: RecoveryItem[]; onClose: () => void }): JSX.Element {
  return <div class="dialog-backdrop"><section class="dialog" role="dialog" aria-modal="true">
    <h2>Restore Unsaved Files</h2>
    <p class="about-description">RustPilot found unsaved recovery snapshots from the previous session.</p>
    <For each={props.items}>{(item) => <div class="recovery-item">
      <span title={item.path}>{fileNameOf(item.path)}</span>
      <button type="button" class="about-copy" onClick={() => { restoreRecovered(item); }}>Restore</button>
      <button type="button" class="about-copy" onClick={() => { removeRecovery(item.path); props.onClose(); }}>Discard</button>
    </div>}</For>
    <button type="button" class="button button-primary" onClick={props.onClose}>Close</button>
  </section></div>;
}
