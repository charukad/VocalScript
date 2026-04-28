import { useEditorStore } from '../../store/editorStore';

interface TimelineRulerProps {
  timelineWidth: number;
}

export const TimelineRuler = ({ timelineWidth }: TimelineRulerProps) => {
  const { zoom, playheadTime, setPlayheadTime } = useEditorStore();

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left + e.currentTarget.scrollLeft;
    const newTime = Math.max(0, clickX / zoom);
    setPlayheadTime(newTime);
  };

  return (
    <div className="timeline-ruler" onClick={handleRulerClick} style={{ cursor: 'pointer' }}>
      <div className="timeline-ruler-empty"></div>
      <div className="timeline-ruler-ticks" style={{ width: `${timelineWidth}px`, backgroundSize: `${zoom}px 100%` }}>
        {/* Playhead Scrubber Line */}
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: '-240px', // stretches across tracks
          left: `${playheadTime * zoom}px`,
          width: '2px',
          backgroundColor: 'red',
          zIndex: 50,
          pointerEvents: 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: '-4px',
            width: '10px',
            height: '10px',
            backgroundColor: 'red',
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)'
          }}></div>
        </div>
      </div>
    </div>
  );
};
