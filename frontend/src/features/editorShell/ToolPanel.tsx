import { MediaPool } from '../../components/editor/MediaPool';
import { AiToolsPanel } from './AiToolsPanel';
import { QuickToolsPanel } from './QuickToolsPanel';
import { TemplatesPanel } from './TemplatesPanel';
import { WorkflowPanel } from './WorkflowPanel';
import type { EditorToolId } from './types';

type ToolPanelProps = {
  activeTool: EditorToolId;
};

export const ToolPanel = ({ activeTool }: ToolPanelProps) => {
  if (activeTool === 'ai') return <AiToolsPanel />;
  if (activeTool === 'templates') return <TemplatesPanel />;
  if (activeTool === 'workflow') return <WorkflowPanel />;
  if (activeTool === 'media') return <MediaPool />;
  return <QuickToolsPanel activeTool={activeTool} />;
};
