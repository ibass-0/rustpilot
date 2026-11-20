/*
 * Icons for the Database tool window. Only the shapes in use are copied here.
 *
 *  - Lucide (https://lucide.dev), ISC License: stroke icons on a 24x24 grid.
 *
 * Brand logos are deliberately not used: they are trademarks, not open source.
 *
 * See THIRD_PARTY_NOTICES.md.
 */
import type { JSX } from 'solid-js';
import type { EngineKind } from '../../domain/dataSource';

interface IconProps {
  size?: number;
}

function Stroke(props: IconProps & { children: JSX.Element }): JSX.Element {
  return (
    <svg
      class="db-icon"
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

export const DbDatabaseIcon = (props: IconProps) => (
  <Stroke size={props.size}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5V19A9 3 0 0 0 21 19V5" />
    <path d="M3 12A9 3 0 0 0 21 12" />
  </Stroke>
);

export const DbFolderIcon = (props: IconProps) => (
  <Stroke size={props.size}>
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </Stroke>
);

export const DbTableIcon = (props: IconProps) => (
  <Stroke size={props.size}>
    <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
  </Stroke>
);

export const DbViewIcon = (props: IconProps) => (
  <Stroke size={props.size}>
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </Stroke>
);

export const DbColumnIcon = (props: IconProps) => (
  <Stroke size={props.size}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
    <path d="M15 3v18" />
  </Stroke>
);

export const DbKeyIcon = (props: IconProps) => (
  <Stroke size={props.size}>
    <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
    <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
  </Stroke>
);

export const DbRefreshIcon = (props: IconProps) => (
  <Stroke size={props.size}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </Stroke>
);

export const DbPlayIcon = (props: IconProps) => (
  <Stroke size={props.size}>
    <polygon points="6 3 20 12 6 21 6 3" />
  </Stroke>
);

export const DbStopIcon = (props: IconProps) => (
  <Stroke size={props.size}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </Stroke>
);

export const DbPlugIcon = (props: IconProps) => (
  <Stroke size={props.size}>
    <path d="M12 22v-5" />
    <path d="M9 8V2" />
    <path d="M15 8V2" />
    <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
  </Stroke>
);

export const DbUnplugIcon = (props: IconProps) => (
  <Stroke size={props.size}>
    <path d="m19 5 3-3" />
    <path d="m2 22 3-3" />
    <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z" />
    <path d="M7.5 13.5 10 11" />
    <path d="M10.5 16.5 13 14" />
    <path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z" />
  </Stroke>
);

export const DbConsoleIcon = (props: IconProps) => (
  <Stroke size={props.size}>
    <path d="m7 11 2-2-2-2" />
    <path d="M11 13h4" />
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
  </Stroke>
);

export const DbPlusIcon = (props: IconProps) => (
  <Stroke size={props.size}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </Stroke>
);

/** The icon of an engine. Every engine uses the generic database glyph; the name beside it says which. */
export function EngineIcon(props: { engine: EngineKind; size?: number }): JSX.Element {
  return <DbDatabaseIcon size={props.size} />;
}
