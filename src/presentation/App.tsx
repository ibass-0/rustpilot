import { loadLayout } from '../application/layoutStore';
import { restoreWorkspace, workspace } from '../application/workspaceStore';
import { Shell } from './layout/Shell';
import { StatusBar } from './layout/StatusBar';
import { ProjectPanel } from './workspace/ProjectPanel';

export default function App() {
  loadLayout();
  void restoreWorkspace();

  return (
    <Shell
      project={<ProjectPanel activePath={null} onOpenFile={(path) => console.log(path)} />}
      editor={<div class="empty-state">Editor</div>}
      status={<StatusBar root={workspace.root} fileName={null} cursor={null} lineEnding={null} />}
    />
  );
}
