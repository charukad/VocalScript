import { useEditorStore } from '../../store/editorStore';

export const TimelineToolbar = () => {
  const { zoom, setZoom, isPlaying, togglePlayback } = useEditorStore();

  return (
    <div className="timeline-toolbar">
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button 
          className="btn-primary" 
          onClick={togglePlayback} 
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 1rem' }}
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          )}
          {isPlaying ? 'Pause' : 'Play'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Zoom:</span>
        <button className="btn-icon" onClick={() => setZoom(Math.max(5, zoom - 5))}>-</button>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', width: '30px', textAlign: 'center' }}>{zoom}x</span>
        <button className="btn-icon" onClick={() => setZoom(Math.min(100, zoom + 5))}>+</button>
      </div>
    </div>
  );
};
