import { createSignal, type JSX } from 'solid-js';
import { saveSettings, settings } from '../../application/workspaceSettingsStore';

export function SettingsDialog(props: { onClose: () => void }): JSX.Element {
  const [excluded, setExcluded] = createSignal(settings.excludedFolders.join(', '));
  const save = async () => {
    await saveSettings({ autosave: settings.autosave, excludedFolders: excluded().split(',').map((item) => item.trim()).filter(Boolean), tabSize: settings.tabSize, insertSpaces: settings.insertSpaces });
    props.onClose();
  };
  return <div class="dialog-backdrop" onClick={props.onClose}><section class="dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
    <h2>Workspace Settings</h2>
    <label class="settings-field"><span>Autosave</span><input type="checkbox" checked={settings.autosave} onChange={(event) => void saveSettings({ autosave: event.currentTarget.checked })} /></label>
    <label class="settings-field"><span>Excluded folders</span><input class="settings-text" value={excluded()} onInput={(event) => setExcluded(event.currentTarget.value)} /></label>
    <p class="about-license">Separate folders with commas. Example: node_modules, target, dist.</p>
    <div class="settings-actions"><button type="button" class="button" onClick={props.onClose}>Cancel</button><button type="button" class="button button-primary" onClick={() => void save()}>Save</button></div>
  </section></div>;
}
