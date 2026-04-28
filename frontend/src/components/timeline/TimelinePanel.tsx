import { useDroppable } from '@dnd-kit/core';
import { useEditorStore } from '../../store/editorStore';
import { DraggableClip } from './DraggableClip';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineRuler } from './TimelineRuler';
import type { TimelineTrack } from '../../types';

interface TrackProps {
  track: TimelineTrack;
  timelineWidth: number;
}

const Track = ({ track, timelineWidth }: TrackProps) => {
  const { clips, zoom, removeClip, setSelectedClip } = useEditorStore();
  const { setNodeRef, isOver } = useDroppable({
    id: track.id,
    data: { type: 'timeline-track', trackType: track.type }
  });

  const trackClips = clips.filter(c => c.trackId === track.id);

  return (
    <div 
      ref={setNodeRef}
      className="timeline-track" 
      style={{ 
        height: '60px', 
        backgroundColor: isOver ? 'rgba(255,255,255,0.05)' : (track.type === 'visual' ? 'rgba(0,0,0,0.1)' : 'var(--bg-app)')
      }}
      onClick={() => setSelectedClip(null)} // Click empty space to deselect
    >
      <div className="track-header" style={{ borderColor: 'transparent' }}>
        <span className="track-title" style={{ color: track.type === 'visual' ? 'var(--text-highlight)' : 'var(--accent-color)' }}>
          {track.name}
        </span>
      </div>
      <div className="track-content" style={{ width: `${timelineWidth}px` }}>
        {trackClips.map(clip => (
          <DraggableClip key={clip.id} clip={clip} zoom={zoom} onRemove={removeClip} />
        ))}
      </div>
    </div>
  );
};

export const TimelinePanel = () => {
  const { tracks, clips, zoom, setZoom, selectedClipId, removeClip } = useEditorStore();

  const maxTime = clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 60);
  const timelineWidth = Math.max(maxTime * zoom + 200, 1000);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Mac trackpad pinch maps to ctrlKey + wheel
      const zoomDelta = e.deltaY > 0 ? -2 : 2;
      setZoom(Math.max(5, Math.min(100, zoom + zoomDelta)));
    }
  };

  return (
    <div className="timeline-panel" onWheel={handleWheel}>
      <TimelineToolbar />
      <div className="timeline-tracks-container">
        <TimelineRuler timelineWidth={timelineWidth} />
        {tracks.map(track => (
          <Track key={track.id} track={track} timelineWidth={timelineWidth} />
        ))}
      </div>
    </div>
  );
};
