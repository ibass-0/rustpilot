import { loadLayout } from '../application/layoutStore';
import { Shell } from './layout/Shell';
import { StatusBar } from './layout/StatusBar';

export default function App() {
  loadLayout();

  return (
    <Shell
      project={<div class="empty-state">Project</div>}
      editor={<div class="empty-state">Editor</div>}
      status={<StatusBar root={null} fileName={null} cursor={null} lineEnding={null} />}
    />
  );
}
