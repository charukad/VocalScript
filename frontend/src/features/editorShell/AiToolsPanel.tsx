import { AutoAnimatePanel } from '../../components/editor/AutoAnimatePanel';
import { AutoGeneratePanel } from '../../components/editor/AutoGeneratePanel';

export const AiToolsPanel = () => (
  <section className="panel workspace-tool-panel ai-tools-panel">
    <div className="panel-header">AI Tools</div>
    <div className="panel-content">
      <AutoGeneratePanel />
      <AutoAnimatePanel />
    </div>
  </section>
);
