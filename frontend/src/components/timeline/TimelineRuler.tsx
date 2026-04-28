import React, { useMemo, useCallback, useRef } from 'react';
import { useEditorStore } from '../../store/editorStore';

interface TimelineRulerProps {
  timelineWidth: number;
}

const formatRulerTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
  return `${s}s`;
};

export const TimelineRuler = ({ timelineWidth }: TimelineRulerProps) => {
  const { zoom, playheadTime, setPlayheadTime } = useEditorStore();
  const ticksRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const calcTimeFromEvent = useCallback((clientX: number) => {
    if (!ticksRef.current) return 0;
    const rect = ticksRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left + ticksRef.current.scrollLeft;
    return Math.max(0, clickX / zoom);
  }, [zoom]);

  // Click to position
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    const time = calcTimeFromEvent(e.clientX);
    setPlayheadTime(time);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newTime = calcTimeFromEvent(moveEvent.clientX);
      setPlayheadTime(newTime);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [calcTimeFromEvent, setPlayheadTime]);

  // Generate tick marks with labels
  const ticks = useMemo(() => {
    const totalSeconds = timelineWidth / zoom;
    let interval = 1;
    if (zoom < 10) interval = 10;
    else if (zoom < 20) interval = 5;
    else if (zoom < 40) interval = 2;

    const items: { time: number; major: boolean }[] = [];
    for (let t = 0; t <= totalSeconds; t += interval) {
      items.push({ time: t, major: true });
      if (interval >= 2) {
        const minorInterval = interval / 2;
        const minorTime = t + minorInterval;
        if (minorTime < totalSeconds) {
          items.push({ time: minorTime, major: false });
        }
      }
    }
    return items;
  }, [timelineWidth, zoom]);

  return (
    <div className="timeline-ruler">
      <div className="timeline-ruler-empty"></div>
      <div 
        ref={ticksRef}
        className="timeline-ruler-ticks" 
        onMouseDown={handleMouseDown}
        style={{ width: `${timelineWidth}px`, cursor: 'pointer' }}
      >
        {/* Tick Marks with Labels */}
        {ticks.map((tick, i) => (
          <div key={i} className={`ruler-tick ${tick.major ? 'major' : 'minor'}`} style={{ left: `${tick.time * zoom}px` }}>
            {tick.major && <span className="ruler-tick-label">{formatRulerTime(tick.time)}</span>}
          </div>
        ))}

        {/* Playhead Scrubber Line */}
        <div className="playhead-line" style={{ left: `${playheadTime * zoom}px` }}>
          <div className="playhead-handle"></div>
        </div>
      </div>
    </div>
  );
};
