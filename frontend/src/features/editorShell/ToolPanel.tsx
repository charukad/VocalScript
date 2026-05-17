import { MediaPool } from '../../components/editor/MediaPool';
import { AiToolsPanel } from './AiToolsPanel';
import { QuickToolsPanel } from './QuickToolsPanel';
import type { EditorToolId } from './types';

type ToolPanelProps = {
  activeTool: EditorToolId;
};

export const ToolPanel = ({ activeTool }: ToolPanelProps) => {
  if (activeTool === 'ai') return <AiToolsPanel />;
  if (activeTool === 'media' || activeTool === 'templates') return <MediaPool />;
  return <QuickToolsPanel activeTool={activeTool} />;
};
