import { useEditorStore } from '../../store/editorStore';

export const TimelineToolbar = () => {
  const { zoom, setZoom, isPlaying, togglePlayback, playheadTime, selectedClipId, splitClip } = useEditorStore();

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 30);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
  };

  return (
    <div className="timeline-toolbar">
      <div className="toolbar-left">
        <button 
          className={`toolbar-play-btn ${isPlaying ? 'playing' : ''}`}
          onClick={togglePlayback} 
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          )}
        </button>
        <div className="toolbar-timecode">{formatTime(playheadTime)}</div>
        <div className="toolbar-divider"></div>
        <button className="btn-secondary toolbar-btn" onClick={() => useEditorStore.getState().addTrack('visual')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Video
        </button>
        <button className="btn-secondary toolbar-btn" onClick={() => useEditorStore.getState().addTrack('audio')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Audio
        </button>
        <div className="toolbar-divider"></div>
        <button 
          className="btn-secondary toolbar-btn" 
          onClick={() => { if (selectedClipId) splitClip(selectedClipId, playheadTime); }}
          disabled={!selectedClipId}
          title="Split Selected Clip at Playhead (Cmd/Ctrl + K)"
          style={{ opacity: selectedClipId ? 1 : 0.5, cursor: selectedClipId ? 'pointer' : 'not-allowed' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="2" y1="12" x2="22" y2="12" stroke="var(--error-color)" strokeWidth="3"></line>
          </svg>
          Split (⌘K)
        </button>
      </div>
      <div className="toolbar-right">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <line x1="11" y1="8" x2="11" y2="14"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
        <input 
          type="range" 
          min="5" 
          max="100" 
          value={zoom} 
          onChange={e => setZoom(Number(e.target.value))} 
          className="zoom-slider"
          title={`Zoom: ${zoom}x`}
        />
        <span className="zoom-label">{zoom}x</span>
      </div>
    </div>
  );
};
