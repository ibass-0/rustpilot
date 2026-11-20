import type { JSX } from 'solid-js';

interface IconProps {
  size?: number;
}

function Icon(props: IconProps & { children: JSX.Element }): JSX.Element {
  return (
    <svg
      class="material-icon"
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.45"
      stroke-linecap="round"
      stroke-linejoin="round"
      shape-rendering="geometricPrecision"
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

/** SSH/network terminal icon: a terminal window with a secure connection mark. */
export const SshIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
    <path d="M4.5 6l2 2-2 2M8.5 10.5h3" />
    <path d="M11.5 2.5v-1M13.5 2.5v-1" />
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

export const CommitIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <circle cx="8" cy="8" r="2.6" />
    <path d="M1.5 8h3.9M10.6 8h3.9" />
  </Icon>
);

export const SearchIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <circle cx="7" cy="7" r="4.2" />
    <path d="M10.2 10.2l3.8 3.8" />
  </Icon>
);

export const StructureIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <rect x="2" y="2" width="4.5" height="3.5" rx="0.8" />
    <rect x="9.5" y="6.3" width="4.5" height="3.5" rx="0.8" />
    <rect x="9.5" y="11" width="4.5" height="3.5" rx="0.8" />
    <path d="M4.2 5.5v7.2h5.3M4.2 8h5.3" />
  </Icon>
);

export const PlayIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M4.5 2.8v10.4l8.5-5.2z" />
  </Icon>
);

export const BugIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <rect x="5" y="5" width="6" height="8" rx="3" />
    <path d="M6 5a2 2 0 0 1 4 0M2.5 9h2.5M11 9h2.5M3 5.5l2.2 1.3M13 5.5l-2.2 1.3M3 13l2.2-1.5M13 13l-2.2-1.5" />
  </Icon>
);

export const ProblemsIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.8v3.9M8 11.2v.1" />
  </Icon>
);

export const BranchIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <circle cx="4.5" cy="3.5" r="1.5" />
    <circle cx="4.5" cy="12.5" r="1.5" />
    <circle cx="11.5" cy="5.5" r="1.5" />
    <path d="M4.5 5v6M11.5 7c0 2.6-7 1.4-7 4" />
  </Icon>
);

export const DatabaseIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <ellipse cx="8" cy="4" rx="5" ry="2" />
    <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
  </Icon>
);

export const BellIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M4 11V7.5a4 4 0 0 1 8 0V11l1.3 1.5H2.7z" />
    <path d="M6.7 14.2a1.5 1.5 0 0 0 2.6 0" />
  </Icon>
);

export const GearIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <circle cx="8" cy="8" r="4.2" />
    <circle cx="8" cy="8" r="1.6" />
    <path d="M8 1.6v2.2M8 12.2v2.2M1.6 8h2.2M12.2 8h2.2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5L5 11M11 5l1.5-1.5" />
  </Icon>
);

export const RefreshIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.8h-2.8" />
  </Icon>
);

export const CollapseAllIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M4.5 3l3.5 3 3.5-3M4.5 13l3.5-3 3.5 3" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M8 3.5v9M3.5 8h9" />
  </Icon>
);

export const MenuIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
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
