import type { JSX } from 'solid-js';
import { fileIconName, folderIconName, type IconManifest } from '../../domain/fileIcons';

/** An icon theme: the lookup table plus where each icon's image lives. */
export interface IconTheme {
  manifest: IconManifest;
  url(iconName: string): string;
}

let theme: IconTheme | null = null;

/** Choose the icon theme. Called once from the composition root. */
export function configureIconTheme(next: IconTheme): void {
  theme = next;
}

function TypeIcon(props: { icon: string | null; size?: number }): JSX.Element {
  const size = () => props.size ?? 16;
  return (
    <img
      class="type-icon"
      src={props.icon && theme ? theme.url(props.icon) : undefined}
      width={size()}
      height={size()}
      alt=""
      draggable={false}
    />
  );
}

/** The icon for a file, picked from its name. */
export function FileTypeIcon(props: { name: string; size?: number }): JSX.Element {
  return <TypeIcon size={props.size} icon={theme ? fileIconName(theme.manifest, props.name) : null} />;
}

/** The icon for a folder, drawn open when expanded. `root` marks the workspace folder. */
export function FolderTypeIcon(props: { name: string; open: boolean; root?: boolean; size?: number }): JSX.Element {
  return (
    <TypeIcon
      size={props.size}
      icon={theme ? folderIconName(theme.manifest, props.name, props.open, props.root === true) : null}
    />
  );
}
