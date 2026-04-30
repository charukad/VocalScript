import React, { useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { TimelineClip } from '../../types';
import { useEditorStore } from '../../store/editorStore';

interface DraggableClipProps {
  clip: TimelineClip;
  zoom: number;
  onRemove: (id: string) => void;
}

export const DraggableClip = ({ clip, zoom, onRemove }: DraggableClipProps) => {
  const { selectedClipId, setSelectedClip, trimClip, assets } = useEditorStore();
  const asset = assets.find(a => a.id === clip.assetId);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ 
    id: clip.id,
    data: { type: 'timeline-clip', clipType: clip.type }
  });

  const isSelected = selectedClipId === clip.id;
  const validDuration = (isNaN(clip.duration) || !isFinite(clip.duration)) ? 5 : clip.duration;
  
  const isTrimmingRef = useRef(false);

  // Helper for trimming
  const handleTrim = (e: React.PointerEvent, edge: 'left' | 'right') => {
    e.stopPropagation();
    isTrimmingRef.current = true;
    
    const startX = e.clientX;
    const initialStartTime = clip.startTime;
    const initialDuration = validDuration;
    const initialMediaOffset = clip.mediaOffset || 0;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const timeDelta = deltaX / zoom;

      if (edge === 'left') {
        const maxTimeDelta = initialDuration - 0.1;
        const minTimeDelta = -initialMediaOffset;
        const clampedDelta = Math.max(minTimeDelta, Math.min(maxTimeDelta, timeDelta));
        
        trimClip(
          clip.id, 
          initialStartTime + clampedDelta, 
          initialDuration - clampedDelta, 
          initialMediaOffset + clampedDelta
        );
      } else {
        const minTimeDelta = -initialDuration + 0.1;
        const clampedDelta = Math.max(minTimeDelta, timeDelta);
        
        trimClip(
          clip.id,
          initialStartTime,
          initialDuration + clampedDelta,
          initialMediaOffset
        );
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setTimeout(() => { isTrimmingRef.current = false; }, 100);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const clipWidth = Math.max(validDuration * zoom, 20);
  const isTextClip = clip.type === 'text';
  const isVisualClip = clip.type === 'visual';

  const style: React.CSSProperties = {
    left: `${clip.startTime * zoom}px`,
    width: `${clipWidth}px`,
    transform: transform && !isTrimmingRef.current ? `translate3d(${transform.x}px, 0, 0)` : undefined,
    zIndex: isDragging ? 100 : (isSelected ? 50 : 1),
    opacity: isDragging ? 0.8 : 1,
    backgroundColor: isTextClip ? '#4a3412' : isVisualClip ? '#2d1b6e' : '#0d385e',
    borderColor: isSelected ? '#fff' : isTextClip ? '#d99a22' : isVisualClip ? '#7c5ce0' : '#2f8fce',
    borderWidth: isSelected ? '2px' : '1px',
    boxShadow: isSelected ? '0 0 0 1px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.4)' : undefined,
    position: 'absolute',
    top: '8px',
    height: '40px',
    borderRadius: '3px',
    display: 'flex',
    alignItems: 'center',
    cursor: 'grab',
    userSelect: 'none',
    overflow: 'hidden', // Crucial for trimming visuals
  };

  const renderTextClip = () => (
    <div
      className="text-clip-background"
      style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.75,
        background: 'linear-gradient(135deg, rgba(251,191,36,0.2), rgba(0,0,0,0.05))',
      }}
    />
  );

  // Audio Waveform Renderer
  const renderWaveform = () => {
    if (!asset?.waveform || asset.waveform.length === 0) {
      return <div className="generating-visuals">Loading waveform...</div>;
    }
    const sourceDuration = asset.duration && Number.isFinite(asset.duration) && asset.duration > 0
      ? asset.duration
      : Math.max(validDuration, (clip.mediaOffset || 0) + validDuration);
    const clipStart = Math.max(0, Math.min(sourceDuration, clip.mediaOffset || 0));
    const clipEnd = Math.max(clipStart, Math.min(sourceDuration, clipStart + validDuration));
    const startIndex = Math.max(0, Math.floor((clipStart / sourceDuration) * asset.waveform.length));
    const endIndex = Math.min(asset.waveform.length, Math.ceil((clipEnd / sourceDuration) * asset.waveform.length));
    const visibleWaveform = asset.waveform.slice(startIndex, Math.max(startIndex + 1, endIndex));
    const bars = visibleWaveform.length > 0 ? visibleWaveform : asset.waveform.slice(0, 1);

    return (
      <div className="audio-waveform-container" style={{ position: 'absolute', inset: 0, opacity: 0.72 }}>
        <svg width="100%" height="100%" preserveAspectRatio="none" viewBox={`0 0 ${bars.length} 100`}>
          {bars.map((amp, i) => {
            const safeAmp = Math.max(0.03, Math.min(1, Number.isFinite(amp) ? amp : 0));
            const height = Math.max(2, safeAmp * 86);
            return (
              <rect
                key={i}
                x={i + 0.15}
                y={50 - height / 2}
                width={0.7}
                height={height}
                rx={0.25}
                fill="#65b7e8"
              />
            );
          })}
        </svg>
      </div>
    );
  };

  // Video Filmstrip Renderer
  const renderFilmstrip = () => {
    if (clip.file.type.startsWith('image')) {
      return (
         <div className="video-filmstrip" style={{ position: 'absolute', inset: 0, backgroundImage: `url(${asset?.thumbnailUrl})`, backgroundSize: 'cover', backgroundRepeat: 'repeat-x', opacity: 0.5 }} />
      );
    }
    if (!asset?.filmstrip || asset.filmstrip.length === 0) {
      return <div className="generating-visuals">Loading thumbnails...</div>;
    }

    return (
      <div className="video-filmstrip" style={{ position: 'absolute', inset: 0, display: 'flex', opacity: 0.6 }}>
        {asset.filmstrip.map((src, i) => (
          <img key={i} src={src} style={{ height: '100%', objectFit: 'cover', flex: '1 0 auto' }} />
        ))}
      </div>
    );
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`clip-item ${isSelected ? 'selected' : ''}`} 
      onClick={(e) => { 
        if (!isTrimmingRef.current) {
          e.stopPropagation(); 
          setSelectedClip(clip.id); 
        }
      }}
      {...(isTrimmingRef.current ? {} : attributes)} 
      {...(isTrimmingRef.current ? {} : listeners)}
    >
      {/* Background Visuals */}
      {clip.type === 'audio' ? renderWaveform() : isTextClip ? renderTextClip() : renderFilmstrip()}

      {/* Left Trim Handle */}
      {isSelected && (
        <button 
          className="trim-handle trim-handle-left"
          onPointerDown={(e) => handleTrim(e, 'left')}
          style={{ border: 'none' }}
        />
      )}

      <div className="clip-name" style={{ position: 'relative', zIndex: 2, textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
        {clip.textData?.content || clip.file.name}
      </div>
      <button className="clip-remove" style={{ zIndex: 3 }} onPointerDown={(e) => {
        e.stopPropagation();
        onRemove(clip.id);
      }}>✕</button>

      {/* Right Trim Handle */}
      {isSelected && (
        <button 
          className="trim-handle trim-handle-right"
          onPointerDown={(e) => handleTrim(e, 'right')}
          style={{ border: 'none' }}
        />
      )}
    </div>
  );
};
