import type { JSX } from 'solid-js';
import { git } from '../../application/gitStore';
import type { ToolWindowId } from '../../domain/layout';
import {
  AgentIcon,
  BellIcon,
  BranchIcon,
  CommitIcon,
  DatabaseIcon,
  FolderIcon,
  PlayIcon,
  ProblemsIcon,
  SearchIcon,
  StructureIcon,
  TerminalIcon,
} from './icons';

export interface ToolWindowInfo {
  id: ToolWindowId;
  title: string;
  /** Keyboard shortcut that toggles it, if it has one. */
  shortcut?: string;
  /** Whether its button sits at the top or the bottom of its stripe. */
  group: 'top' | 'bottom';
  icon: (size?: number) => JSX.Element;
  /** What the tool window will do, shown until the feature exists. */
  preview: string;
  /** Optional live badge shown over the stripe button. */
  badge?: () => number;
}

/** Every tool window. The domain decides which side each docks on; this adds how it looks. */
export const TOOL_WINDOWS: Record<ToolWindowId, ToolWindowInfo> = {
  project: {
    id: 'project',
    title: 'Project',
    shortcut: 'Alt+1',
    group: 'top',
    icon: (size) => <FolderIcon size={size} />,
    preview: 'Browse the files of the open folder.',
  },
  commit: {
    id: 'commit',
    title: 'Commit',
    shortcut: 'Alt+0',
    group: 'top',
    icon: (size) => <CommitIcon size={size} />,
    preview: 'Review changed files, stage them and commit.',
    badge: () => git.status.changes.length,
  },
  search: {
    id: 'search',
    title: 'Find in Files',
    shortcut: 'Ctrl+Shift+F',
    group: 'top',
    icon: (size) => <SearchIcon size={size} />,
    preview: 'Search text across every file in the folder.',
  },
  structure: {
    id: 'structure',
    title: 'Structure',
    shortcut: 'Alt+7',
    group: 'top',
    icon: (size) => <StructureIcon size={size} />,
    preview: 'Outline of the functions and types in the current file.',
  },
  run: {
    id: 'run',
    title: 'Run',
    shortcut: 'Alt+4',
    group: 'bottom',
    icon: (size) => <PlayIcon size={size} />,
    preview: 'Output of run configurations and tasks.',
  },
  terminal: {
    id: 'terminal',
    title: 'Terminal',
    shortcut: 'Alt+F12',
    group: 'bottom',
    icon: (size) => <TerminalIcon size={size} />,
    preview: 'A shell in the project folder.',
  },
  problems: {
    id: 'problems',
    title: 'Problems',
    shortcut: 'Alt+6',
    group: 'bottom',
    icon: (size) => <ProblemsIcon size={size} />,
    preview: 'Errors and warnings found in the project.',
  },
  git: {
    id: 'git',
    title: 'Git',
    shortcut: 'Alt+9',
    group: 'bottom',
    icon: (size) => <BranchIcon size={size} />,
    preview: 'Branches and commit history.',
  },
  agent: {
    id: 'agent',
    title: 'AI Agent',
    shortcut: 'Alt+2',
    group: 'top',
    icon: (size) => <AgentIcon size={size} />,
    preview: 'Chat with a coding agent that can read and edit the project.',
  },
  database: {
    id: 'database',
    title: 'Database',
    group: 'top',
    icon: (size) => <DatabaseIcon size={size} />,
    preview: 'Connect to a database, browse tables and run queries.',
  },
  notifications: {
    id: 'notifications',
    title: 'Notifications',
    group: 'top',
    icon: (size) => <BellIcon size={size} />,
    preview: 'Messages from background tasks.',
  },
};

/** The empty state of a tool window whose feature has not been built yet. */
export function ToolWindowPreview(props: { info: ToolWindowInfo }): JSX.Element {
  return (
    <div class="empty-state">
      {props.info.icon(28)}
      <span class="empty-state-title">{props.info.title}</span>
      <span>{props.info.preview}</span>
      <span class="empty-state-note">Coming in a later phase.</span>
    </div>
  );
}
