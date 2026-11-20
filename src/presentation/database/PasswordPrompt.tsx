import { createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { answerPassword, dataSources } from '../../application/dataSourceStore';
import '../styles/database.css';
import { DbKeyIcon } from './dbIcons';

/** Asks for the password of a server whose password is not saved. Shown while `dataSources.passwordRequest` is set. */
export default function PasswordPrompt(): JSX.Element {
  const [value, setValue] = createSignal('');
  let input!: HTMLInputElement;

  onMount(() => {
    input.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') answerPassword(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown, true));
  });

  return (
    <div class="dialog-backdrop">
      <form
        class="dialog db-dialog db-password"
        role="dialog"
        aria-modal="true"
        aria-label="Password"
        onSubmit={(event) => {
          event.preventDefault();
          answerPassword(value());
        }}
      >
        <h2 class="db-dialog-title">
          <DbKeyIcon size={20} />
          Password
        </h2>
        <label class="db-field">
          <span>Password for {dataSources.passwordRequest?.name}</span>
          <input ref={input} type="password" autocomplete="off" value={value()} onInput={(e) => setValue(e.currentTarget.value)} />
        </label>
        <div class="db-dialog-actions">
          <span class="db-dialog-spacer" />
          <button type="button" class="button" onClick={() => answerPassword(null)}>
            Cancel
          </button>
          <button type="submit" class="button button-primary">
            Connect
          </button>
        </div>
      </form>
    </div>
  );
}
