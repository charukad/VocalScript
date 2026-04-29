import React from 'react';
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
  const { clips, zoom, removeClip, setSelectedClip, updateTrack } = useEditorStore();
  const { setNodeRef, isOver } = useDroppable({
    id: track.id,
    data: { type: 'timeline-track', trackType: track.type },
    disabled: Boolean(track.locked)
  });

  const trackClips = clips.filter(c => c.trackId === track.id);
  const isVisual = track.type === 'visual';
  const isText = track.type === 'text';
  const trackColor = isText ? '#fbbf24' : isVisual ? '#a78bfa' : '#60a5fa';

  return (
    <div 
      ref={setNodeRef}
      className={`timeline-track ${isOver ? 'track-hover' : ''}`}
      style={{ 
        backgroundColor: isOver ? 'rgba(0, 122, 204, 0.08)' : undefined
      }}
      onClick={() => setSelectedClip(null)}
    >
      <div className="track-header">
        <div className="track-header-top">
          <span className="track-title" style={{ color: trackColor }}>
            {track.name}
          </span>
        </div>
        <div className="track-controls">
          <button
            className={`track-ctrl-btn ${track.muted ? 'active' : ''}`}
            title="Mute Track"
            onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }); }}
          >
            M
          </button>
          <button
            className={`track-ctrl-btn ${track.solo ? 'active' : ''}`}
            title="Solo Track"
            onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }}
          >
            S
          </button>
          <button
            className={`track-ctrl-btn ${track.locked ? 'active' : ''}`}
            title="Lock Track"
            onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { locked: !track.locked }); }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </button>
        </div>
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
  const { tracks, clips, zoom, setZoom } = useEditorStore();

  const maxTime = clips.reduce((max, clip) => {
    const end = clip.startTime + clip.duration;
    if (isNaN(end) || !isFinite(end)) return max;
    return Math.max(max, end);
  }, 10);
  // Add 30 seconds of padding so the user can always scroll/click beyond the last clip
  const timelineWidth = Math.max((maxTime + 30) * zoom, 1000);

  const sortedTracks = React.useMemo(() => {
    const visualTracks = tracks.filter(t => t.type === 'visual').sort((a, b) => b.order - a.order);
    const textTracks = tracks.filter(t => t.type === 'text').sort((a, b) => b.order - a.order);
    const audioTracks = tracks.filter(t => t.type === 'audio').sort((a, b) => a.order - b.order);
    return { visualTracks, textTracks, audioTracks };
  }, [tracks]);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? -2 : 2;
      setZoom(Math.max(5, Math.min(100, zoom + zoomDelta)));
    }
  };

  return (
    <div className="timeline-panel" onWheel={handleWheel}>
      <TimelineToolbar />
      <div className="timeline-tracks-container">
        <TimelineRuler timelineWidth={timelineWidth} />
        
        {/* Visual Tracks */}
        {sortedTracks.visualTracks.map(track => (
          <Track key={track.id} track={track} timelineWidth={timelineWidth} />
        ))}

        {/* Text Tracks */}
        {sortedTracks.textTracks.map(track => (
          <Track key={track.id} track={track} timelineWidth={timelineWidth} />
        ))}

        {/* Separator between Video and Audio */}
        {(sortedTracks.visualTracks.length > 0 || sortedTracks.textTracks.length > 0) && sortedTracks.audioTracks.length > 0 && (
          <div className="track-separator">
            <div className="track-separator-line"></div>
          </div>
        )}

        {/* Audio Tracks */}
        {sortedTracks.audioTracks.map(track => (
          <Track key={track.id} track={track} timelineWidth={timelineWidth} />
        ))}
      </div>
    </div>
  );
};
