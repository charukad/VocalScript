import {
  AudioLines,
  Captions,
  ClipboardCheck,
  Clapperboard,
  Image,
  Layers3,
  Sparkles,
  Type,
  WandSparkles,
} from 'lucide-react';
import { IconButton } from '../../components/ui/IconButton';
import type { EditorToolId } from './types';

type ToolRailItem = {
  id: EditorToolId;
  label: string;
  icon: typeof Image;
  enabled: boolean;
};

const toolRailItems: ToolRailItem[] = [
  { id: 'media', label: 'Media', icon: Image, enabled: true },
  { id: 'audio', label: 'Audio', icon: AudioLines, enabled: true },
  { id: 'text', label: 'Text', icon: Type, enabled: true },
  { id: 'captions', label: 'Captions', icon: Captions, enabled: true },
  { id: 'effects', label: 'Effects', icon: Sparkles, enabled: true },
  { id: 'transitions', label: 'Transitions', icon: Layers3, enabled: true },
  { id: 'templates', label: 'Templates', icon: Clapperboard, enabled: true },
  { id: 'workflow', label: 'Workflow', icon: ClipboardCheck, enabled: true },
  { id: 'ai', label: 'AI Tools', icon: WandSparkles, enabled: true },
];

type ToolRailProps = {
  activeTool: EditorToolId;
  onSelectTool: (tool: EditorToolId) => void;
};

export const ToolRail = ({ activeTool, onSelectTool }: ToolRailProps) => (
  <nav className="tool-rail" aria-label="Editor tools">
    {toolRailItems.map(item => {
      const Icon = item.icon;
      return (
        <IconButton
          key={item.id}
          icon={<Icon size={18} strokeWidth={2} />}
          active={activeTool === item.id}
          disabled={!item.enabled}
          aria-label={item.label}
          title={item.label}
          onClick={() => onSelectTool(item.id)}
        />
      );
    })}
  </nav>
);
