import { useDraggable } from '@dnd-kit/core';
import type { TimelineClip } from '../../types';
import { useEditorStore } from '../../store/editorStore';

interface DraggableClipProps {
  clip: TimelineClip;
  zoom: number;
  onRemove: (id: string) => void;
}

export const DraggableClip = ({ clip, zoom, onRemove }: DraggableClipProps) => {
  const { selectedClipId, setSelectedClip } = useEditorStore();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ 
    id: clip.id,
    data: { type: 'timeline-clip', clipType: clip.type }
  });

  const isSelected = selectedClipId === clip.id;

  const style = {
    left: `${clip.startTime * zoom}px`,
    width: `${clip.duration * zoom}px`,
    transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined,
    zIndex: isDragging ? 100 : (isSelected ? 50 : 1),
    opacity: isDragging ? 0.8 : 1,
    backgroundColor: clip.type === 'visual' ? '#6236FF' : 'var(--accent-hover)',
    borderColor: isSelected ? '#fff' : (clip.type === 'visual' ? '#4827c1' : '#57a1d1'),
    borderWidth: isSelected ? '2px' : '1px',
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="clip-item" 
      onClick={(e) => { e.stopPropagation(); setSelectedClip(clip.id); }}
      {...attributes} 
      {...listeners}
    >
      <div className="clip-name">{clip.file.name}</div>
      <button className="clip-remove" onPointerDown={(e) => {
        e.stopPropagation();
        onRemove(clip.id);
      }}>✕</button>
    </div>
  );
};
