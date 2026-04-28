import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useEditorStore } from '../../store/editorStore';
import { DraggableClip } from './DraggableClip';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineRuler } from './TimelineRuler';

export const TimelinePanel = () => {
  const { clips, zoom, removeClip, updateClipStartTime } = useEditorStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    updateClipStartTime(active.id as string, delta.x);
  };

  const maxTime = clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 60);
  const timelineWidth = Math.max(maxTime * zoom + 200, 1000);

  const visualClips = clips.filter(c => c.type === 'visual');
  const audioClips = clips.filter(c => c.type === 'audio');

  return (
    <div className="timeline-panel">
      <TimelineToolbar />
      
      <div className="timeline-tracks-container">
        <TimelineRuler timelineWidth={timelineWidth} />
        
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {/* Visual Track */}
          <div className="timeline-track" style={{ height: '60px', backgroundColor: 'rgba(0,0,0,0.1)' }}>
            <div className="track-header" style={{ borderColor: 'transparent' }}>
              <span className="track-title" style={{ color: 'var(--text-highlight)' }}>Visual (V1)</span>
            </div>
            <div className="track-content" style={{ width: `${timelineWidth}px` }}>
              {visualClips.map(clip => (
                <DraggableClip key={clip.id} clip={clip} zoom={zoom} onRemove={removeClip} />
              ))}
            </div>
          </div>

          {/* Audio Track */}
          <div className="timeline-track">
            <div className="track-header">
              <span className="track-title" style={{ color: 'var(--accent-color)' }}>Audio (A1)</span>
            </div>
            <div className="track-content" style={{ width: `${timelineWidth}px` }}>
              {audioClips.map(clip => (
                <DraggableClip key={clip.id} clip={clip} zoom={zoom} onRemove={removeClip} />
              ))}
            </div>
          </div>
        </DndContext>
      </div>
    </div>
  );
};
