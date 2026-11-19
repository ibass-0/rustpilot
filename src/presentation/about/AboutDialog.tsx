import { createSignal, For, onCleanup, onMount, type JSX } from 'solid-js';
import type { AppInfo } from '../../domain/appInfo';
import { CloseIcon, LogoMark } from '../layout/icons';

/** One labelled value that can be selected or copied; the app cannot open links itself yet. */
function Detail(props: { label: string; value: string }): JSX.Element {
  const [copied, setCopied] = createSignal(false);

  const copy = () => {
    void navigator.clipboard.writeText(props.value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div class="about-detail">
      <span class="about-label">{props.label}</span>
      <span class="about-value">{props.value}</span>
      <button type="button" class="about-copy" onClick={copy}>
        {copied() ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/** The About dialog: what the app is, which version, who wrote it, and what it is built on. */
export function AboutDialog(props: { info: AppInfo; onClose: () => void }): JSX.Element {
  let closeButton!: HTMLButtonElement;

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
    closeButton.focus();
  });

  return (
    <div class="dialog-backdrop" onClick={() => props.onClose()}>
      <section
        class="dialog about"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" class="icon-button dialog-close" aria-label="Close" ref={closeButton} onClick={() => props.onClose()}>
          <CloseIcon />
        </button>

        <header class="about-header">
          <LogoMark size={56} />
          <div>
            <h1 id="about-title" class="about-name">
              {props.info.name}
            </h1>
            <span class="about-version">Version {props.info.version}</span>
          </div>
        </header>

        <p class="about-description">{props.info.description}</p>

        <h2 class="about-heading">Author</h2>
        <Detail label="Name" value={props.info.author.name} />
        <Detail label="Email" value={props.info.author.email} />
        <Detail label="GitHub" value={props.info.author.github} />

        <h2 class="about-heading">Built with</h2>
        <ul class="about-credits">
          <For each={props.info.credits}>
            {(credit) => (
              <li>
                <span>{credit.name}</span>
                <span class="about-license">{credit.license}</span>
              </li>
            )}
          </For>
        </ul>
      </section>
    </div>
  );
}
