import type { JSX } from 'solid-js';

interface IconProps {
  size?: number;
}

function Icon(props: IconProps & { children: JSX.Element }): JSX.Element {
  return (
    <svg
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

export const FolderIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M1.5 4.5a1 1 0 0 1 1-1h3.2l1.5 1.5h6.3a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
  </Icon>
);

export const FileIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M4.5 1.5h5l3 3v9a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z" />
    <path d="M9.5 1.5v3h3" />
  </Icon>
);

export const TerminalIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
    <path d="M4.5 6l2 2-2 2M8.5 10.5h3" />
  </Icon>
);

export const AgentIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M8 1.5l1.6 4.9L14.5 8l-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z" />
  </Icon>
);

export const ChevronIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M6 4l4 4-4 4" />
  </Icon>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M4 6l4 4 4-4" />
  </Icon>
);

export const MinimizeIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M3.5 8h9" />
  </Icon>
);

export const MaximizeIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <rect x="3.5" y="3.5" width="9" height="9" rx="1" />
  </Icon>
);

export const RestoreIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <rect x="3" y="5" width="8" height="8" rx="1" />
    <path d="M5.5 5V4a1 1 0 0 1 1-1H12a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-1" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);

/** The RustPilot mark: the navigation arrow and cursor line from the app icon. */
export const LogoMark = (props: IconProps) => (
  <svg width={props.size ?? 20} height={props.size ?? 20} viewBox="0 0 1024 1024" aria-hidden="true">
    <defs>
      <linearGradient id="logo-tile" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ff8a3d" />
        <stop offset="0.55" stop-color="#e2531b" />
        <stop offset="1" stop-color="#a8320f" />
      </linearGradient>
    </defs>
    <rect x="64" y="64" width="896" height="896" rx="208" fill="url(#logo-tile)" />
    <path d="M742 262 L300 452 L470 536 Z" fill="#fff" />
    <path d="M742 262 L470 536 L556 716 Z" fill="#fff" fill-opacity="0.78" />
    <rect x="282" y="742" width="300" height="52" rx="26" fill="#1e1f22" fill-opacity="0.85" />
  </svg>
);
