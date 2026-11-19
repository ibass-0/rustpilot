import { Match, Switch, type JSX } from 'solid-js';
import { fileIconFor, folderIconFor, type IconShape } from '../../domain/fileIcons';

interface SizeProps {
  size?: number;
}

function Frame(props: SizeProps & { tint: string; children: JSX.Element }): JSX.Element {
  return (
    <svg
      class={`type-icon tint-${props.tint}`}
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

/** A rounded tile with one or two characters, e.g. `TS` or `{}`. */
function Badge(props: { label: string }): JSX.Element {
  return (
    <>
      <rect x="0.5" y="1.5" width="15" height="13" rx="3" fill="currentColor" fill-opacity="0.16" stroke="none" />
      <text
        x="8"
        y={props.label.length > 1 ? 10.9 : 11.4}
        text-anchor="middle"
        font-size={props.label.length > 1 ? '7.4' : '9.6'}
        font-weight="700"
        fill="currentColor"
        stroke="none"
      >
        {props.label}
      </text>
    </>
  );
}

function Pictogram(props: { shape: IconShape }): JSX.Element {
  return (
    <Switch>
      <Match when={props.shape === 'file'}>
        <path d="M4.5 1.5h5l3 3v9a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z" />
        <path d="M9.5 1.5v3h3" />
      </Match>
      <Match when={props.shape === 'text'}>
        <path d="M4.5 1.5h5l3 3v9a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z" />
        <path d="M5.8 8h4.4M5.8 10.5h4.4M5.8 5.5h2" />
      </Match>
      <Match when={props.shape === 'image'}>
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <circle cx="5.6" cy="6.4" r="1" />
        <path d="M2.4 11.4l3.3-3 2.4 2.2 2-1.8 3.5 3.2" />
      </Match>
      <Match when={props.shape === 'lock'}>
        <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      </Match>
      <Match when={props.shape === 'gear'}>
        <circle cx="8" cy="8" r="4.2" />
        <circle cx="8" cy="8" r="1.6" />
        <path d="M8 1.6v2.2M8 12.2v2.2M1.6 8h2.2M12.2 8h2.2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5L5 11M11 5l1.5-1.5" />
      </Match>
      <Match when={props.shape === 'git'}>
        <circle cx="4.5" cy="3.5" r="1.5" />
        <circle cx="4.5" cy="12.5" r="1.5" />
        <circle cx="11.5" cy="5.5" r="1.5" />
        <path d="M4.5 5v6M11.5 7c0 2.6-7 1.4-7 4" />
      </Match>
      <Match when={props.shape === 'terminal'}>
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
        <path d="M4.5 6l2 2-2 2M8.5 10.5h3" />
      </Match>
      <Match when={props.shape === 'database'}>
        <ellipse cx="8" cy="4" rx="5" ry="2" />
        <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
      </Match>
      <Match when={props.shape === 'archive'}>
        <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
        <path d="M8 2.5v1.6M8 5.6v1.6M8 8.7v1.6" />
        <rect x="6.9" y="10.8" width="2.2" height="1.6" rx="0.4" />
      </Match>
    </Switch>
  );
}

/** The icon for a file, picked from its name. */
export function FileTypeIcon(props: SizeProps & { name: string }): JSX.Element {
  const icon = () => fileIconFor(props.name);
  return (
    <Frame size={props.size} tint={icon().tint}>
      {(() => {
        const current = icon();
        return current.shape === 'badge' ? <Badge label={current.label} /> : <Pictogram shape={current.shape} />;
      })()}
    </Frame>
  );
}

/** A folder, tinted by what it usually holds, drawn open when expanded. */
export function FolderTypeIcon(props: SizeProps & { name: string; open: boolean }): JSX.Element {
  return (
    <Frame size={props.size} tint={folderIconFor(props.name).tint}>
      {props.open ? (
        <>
          <path d="M1.5 12V4.5a1 1 0 0 1 1-1h3.2l1.5 1.5h5.3a1 1 0 0 1 1 1V7" />
          <path
            d="M1.6 12.6l1.7-4.9a1 1 0 0 1 .95-.7h9.6a.6.6 0 0 1 .57.8l-1.5 4.3a1 1 0 0 1-.95.7H2.5a.95.95 0 0 1-.9-1.2z"
            fill="currentColor"
            fill-opacity="0.2"
          />
        </>
      ) : (
        <path
          d="M1.5 4.5a1 1 0 0 1 1-1h3.2l1.5 1.5h6.3a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"
          fill="currentColor"
          fill-opacity="0.2"
        />
      )}
    </Frame>
  );
}
