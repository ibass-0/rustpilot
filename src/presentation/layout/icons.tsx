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
    <path d="M8 1.5l1.6 4.9L14.5 8l-4.900 1.600L8 14.5l-1.600-4.900L1.5 8l4.900-1.600z" />
  </Icon>
);

export const ChevronIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M6 4l4 4-4 4" />
  </Icon>
);

export const MinimizeIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M3.5 8h9" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon size={props.size}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);
