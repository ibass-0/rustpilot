import { createSignal, onCleanup, onMount, Show, type JSX } from 'solid-js';
import { dataSources, newSourceId, pickDatabaseFile, saveSource, testSource } from '../../application/dataSourceStore';
import {
  defaultName,
  defaultPort,
  effectiveColor,
  ENGINE_LABELS,
  ENVIRONMENTS,
  isServerEngine,
  newConfig,
  validateConfig,
  type DataSourceConfig,
  type EngineKind,
  type Environment,
  type SslMode,
} from '../../domain/dataSource';
import { toAppError } from '../../domain/fs';
import '../styles/database.css';
import { ColorPicker, ProviderBadge } from './badges';

const SSL_LABELS: Record<SslMode, string> = { disable: 'Disable', prefer: 'Prefer', require: 'Require' };

/** Create or edit a data source. `engine` is fixed: a new source picks it from the Add menu. */
export function ConnectionDialog(props: {
  initial: DataSourceConfig | null;
  engine: EngineKind;
  onClose: () => void;
}): JSX.Element {
  const id = props.initial?.id ?? newSourceId();
  const start = props.initial ?? newConfig(props.engine, id);
  const server = isServerEngine(props.engine);

  const [name, setName] = createSignal(start.name);
  const [filePath, setFilePath] = createSignal(start.filePath ?? '');
  const [readOnly, setReadOnly] = createSignal(start.readOnly);
  const [host, setHost] = createSignal(start.host ?? '');
  const [port, setPort] = createSignal(start.port === null ? '' : String(start.port));
  const [database, setDatabase] = createSignal(start.database ?? '');
  const [user, setUser] = createSignal(start.user ?? '');
  const [password, setPassword] = createSignal('');
  const [sslMode, setSslMode] = createSignal<SslMode>(start.sslMode);
  const [savePassword, setSavePassword] = createSignal(start.savePassword);
  const [outcome, setOutcome] = createSignal<{ ok: boolean; message: string } | null>(null);
  const [groupId, setGroupId] = createSignal<string | null>(start.groupId);
  const [environment, setEnvironment] = createSignal<Environment | null>(start.environment);
  const [color, setColor] = createSignal<string | null>(start.color);
  const [busy, setBusy] = createSignal(false);

  const draft = (): DataSourceConfig => ({
    ...start,
    id,
    name: name().trim(),
    engine: props.engine,
    filePath: server ? null : filePath().trim() === '' ? null : filePath().trim(),
    readOnly: readOnly(),
    host: server ? host().trim() : null,
    port: server && port().trim() !== '' ? Number(port().trim()) : null,
    database: server && database().trim() !== '' ? database().trim() : null,
    user: server ? user().trim() : null,
    sslMode: sslMode(),
    savePassword: server && savePassword(),
    groupId: groupId(),
    environment: environment(),
    color: color(),
  });
  /** The name may be left empty: the host or file name is used. */
  const problem = () => {
    const config = draft();
    return validateConfig(config.name === '' ? { ...config, name: defaultName(config) || ENGINE_LABELS[props.engine] } : config);
  };

  /** With Save password on and the field left empty, the saved password is used. Otherwise what is typed counts, even if empty. */
  const typedPassword = (): string | undefined => (password() === '' && savePassword() ? undefined : password());

  const browse = async () => {
    const picked = await pickDatabaseFile();
    if (picked === null) return;
    setFilePath(picked);
    setOutcome(null);
    if (name().trim() === '') setName(defaultName(draft()));
  };

  const test = async () => {
    setBusy(true);
    setOutcome(null);
    setOutcome(await testSource(draft(), server ? typedPassword() : undefined));
    setBusy(false);
  };

  const submit = async (event: Event) => {
    event.preventDefault();
    if (problem() || busy()) return;
    setBusy(true);
    try {
      const config = draft();
      if (config.name === '') config.name = defaultName(config) || ENGINE_LABELS[props.engine];
      await saveSource(config, server ? password() : undefined);
      props.onClose();
    } catch (err) {
      setOutcome({ ok: false, message: toAppError(err).message });
      setBusy(false);
    }
  };

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  const clearOutcome = () => setOutcome(null);

  return (
    <div class="dialog-backdrop">
      <form class="dialog db-dialog" role="dialog" aria-modal="true" aria-label="Data Source" onSubmit={submit}>
        <h2 class="db-dialog-title">
          <ProviderBadge engine={props.engine} size={22} />
          {props.initial ? 'Edit' : 'New'} {ENGINE_LABELS[props.engine]} Data Source
        </h2>

        <label class="db-field">
          <span>Name</span>
          <input
            type="text"
            value={name()}
            placeholder={defaultName(draft()) || ENGINE_LABELS[props.engine]}
            onInput={(e) => setName(e.currentTarget.value)}
            autofocus
          />
        </label>

        <Show
          when={server}
          fallback={
            <>
              <label class="db-field">
                <span>SQLite file</span>
                <div class="db-field-row">
                  <input
                    type="text"
                    value={filePath()}
                    placeholder="C:/path/to/database.db"
                    onInput={(e) => {
                      setFilePath(e.currentTarget.value);
                      clearOutcome();
                    }}
                  />
                  <button type="button" class="button" onClick={() => void browse()}>
                    Browse…
                  </button>
                </div>
              </label>
            </>
          }
        >
          <div class="db-field-row db-host-row">
            <label class="db-field db-grow">
              <span>Host</span>
              <input type="text" value={host()} onInput={(e) => { setHost(e.currentTarget.value); clearOutcome(); }} />
            </label>
            <label class="db-field db-port">
              <span>Port</span>
              <input
                type="text"
                inputmode="numeric"
                value={port()}
                placeholder={String(defaultPort(props.engine) ?? '')}
                onInput={(e) => { setPort(e.currentTarget.value); clearOutcome(); }}
              />
            </label>
          </div>
          <div class="db-field-row">
            <label class="db-field db-grow">
              <span>User</span>
              <input type="text" value={user()} autocomplete="off" onInput={(e) => { setUser(e.currentTarget.value); clearOutcome(); }} />
            </label>
            <label class="db-field db-grow">
              <span>Password</span>
              <input
                type="password"
                value={password()}
                autocomplete="off"
                placeholder={props.initial?.savePassword && savePassword() ? 'Saved password is kept' : ''}
                onInput={(e) => { setPassword(e.currentTarget.value); clearOutcome(); }}
              />
            </label>
          </div>
          <label class="db-check">
            <input type="checkbox" checked={savePassword()} onChange={(e) => setSavePassword(e.currentTarget.checked)} />
            <span>Save password in the Windows Credential Manager</span>
          </label>
          <div class="db-field-row">
            <label class="db-field db-grow">
              <span>Database (optional)</span>
              <input type="text" value={database()} onInput={(e) => { setDatabase(e.currentTarget.value); clearOutcome(); }} />
            </label>
            <label class="db-field db-ssl">
              <span>SSL</span>
              <select value={sslMode()} onChange={(e) => { setSslMode(e.currentTarget.value as SslMode); clearOutcome(); }}>
                {(Object.keys(SSL_LABELS) as SslMode[]).map((mode) => (
                  <option value={mode} selected={mode === sslMode()}>{SSL_LABELS[mode]}</option>
                ))}
              </select>
            </label>
          </div>
        </Show>

        <label class="db-check">
          <input type="checkbox" checked={readOnly()} onChange={(e) => setReadOnly(e.currentTarget.checked)} />
          <span>Read-only</span>
        </label>

        <div class="db-field-row">
          <label class="db-field db-grow">
            <span>Group</span>
            <select value={groupId() ?? ''} onChange={(e) => setGroupId(e.currentTarget.value || null)}>
              <option value="" selected={groupId() === null}>No group</option>
              {dataSources.groups.map((group) => (
                <option value={group.id} selected={group.id === groupId()}>{group.name}</option>
              ))}
            </select>
          </label>
          <label class="db-field db-grow">
            <span>Environment</span>
            <select value={environment() ?? ''} onChange={(e) => setEnvironment((e.currentTarget.value || null) as Environment | null)}>
              <option value="" selected={environment() === null}>None</option>
              {ENVIRONMENTS.map((env) => (
                <option value={env.id} selected={env.id === environment()}>{env.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div class="db-field">
          <span>
            Color{' '}
            <Show when={effectiveColor({ color: color(), environment: environment() })}>
              {(value) => <span class="color-preview" style={{ background: value() }} />}
            </Show>
          </span>
          <ColorPicker value={color()} onChange={setColor} noneLabel="Default (follows the environment)" />
        </div>

        <div class="db-dialog-status" role="status" data-ok={outcome()?.ok ? '' : undefined}>
          <Show when={outcome()}>{(result) => result().message}</Show>
        </div>
        <div class="db-dialog-actions">
          <button type="button" class="button" disabled={busy() || problem() !== null} onClick={() => void test()}>
            {busy() ? 'Working…' : 'Test Connection'}
          </button>
          <span class="db-dialog-spacer" />
          <button type="button" class="button" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" class="button button-primary" disabled={busy() || problem() !== null} title={problem() ?? undefined}>
            OK
          </button>
        </div>
      </form>
    </div>
  );
}
