import { Captions, CopyPlus, Flag, Group, Ungroup, Trash2 } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';

export const TimelineToolbar = () => {
  const {
    zoom,
    setZoom,
    isPlaying,
    togglePlayback,
    playheadTime,
    selectedClipId,
    selectedClipIds,
    splitClip,
    duplicateClip,
    rippleDeleteClip,
    groupSelectedClips,
    ungroupSelectedClips,
    rippleTrimClip,
    rollTrimClip,
    slipClip,
    slideClip,
    addMarker,
    undo,
    redo,
    historyPast,
    historyFuture,
    snapEnabled,
    toggleSnap,
  } = useEditorStore();

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
        <button className="btn-secondary toolbar-btn" onClick={undo} disabled={historyPast.length === 0} title="Undo (Cmd/Ctrl + Z)">
          Undo
        </button>
        <button className="btn-secondary toolbar-btn" onClick={redo} disabled={historyFuture.length === 0} title="Redo (Cmd/Ctrl + Shift + Z)">
          Redo
        </button>
        <button className={`btn-secondary toolbar-btn ${snapEnabled ? 'active' : ''}`} onClick={toggleSnap} title="Toggle Snapping">
          Snap
        </button>
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
        <button
          className="btn-secondary toolbar-btn"
          onClick={() => { if (selectedClipId) duplicateClip(selectedClipId); }}
          disabled={!selectedClipId}
          title="Duplicate Selected Clip (Cmd/Ctrl + D)"
        >
          <CopyPlus size={12} />
          Duplicate
        </button>
        <button
          className="btn-secondary toolbar-btn"
          onClick={() => { if (selectedClipId) rippleDeleteClip(selectedClipId); }}
          disabled={!selectedClipId}
          title="Ripple Delete Selected Clip (Shift + Delete)"
        >
          <Trash2 size={12} />
          Ripple Delete
        </button>
        <button
          className="btn-secondary toolbar-btn"
          onClick={() => addMarker(playheadTime)}
          title="Add Marker at Playhead (M)"
        >
          <Flag size={12} />
          Marker
        </button>
        <button
          className="btn-secondary toolbar-btn"
          onClick={groupSelectedClips}
          disabled={selectedClipIds.length < 2}
          title="Group Selected Clips (Cmd/Ctrl + G)"
        >
          <Group size={12} />
          Group
        </button>
        <button
          className="btn-secondary toolbar-btn"
          onClick={ungroupSelectedClips}
          disabled={selectedClipIds.length === 0}
          title="Ungroup Selected Clips (Cmd/Ctrl + Shift + G)"
        >
          <Ungroup size={12} />
          Ungroup
        </button>
        <div className="toolbar-divider"></div>
        <div className="toolbar-edit-cluster" aria-label="Timeline edit nudges">
          <button className="btn-secondary toolbar-btn" disabled={!selectedClipId} onClick={() => selectedClipId && rippleTrimClip(selectedClipId, 'right', 0.1)} title="Ripple trim out +0.1s">
            Ripple +
          </button>
          <button className="btn-secondary toolbar-btn" disabled={!selectedClipId} onClick={() => selectedClipId && rollTrimClip(selectedClipId, 0.1)} title="Roll edit +0.1s">
            Roll +
          </button>
          <button className="btn-secondary toolbar-btn" disabled={!selectedClipId} onClick={() => selectedClipId && slipClip(selectedClipId, 0.1)} title="Slip media +0.1s">
            Slip +
          </button>
          <button className="btn-secondary toolbar-btn" disabled={!selectedClipId} onClick={() => selectedClipId && slideClip(selectedClipId, 0.1)} title="Slide clip +0.1s">
            Slide +
          </button>
        </div>
        <div className="toolbar-divider"></div>
        <button 
          className="btn-secondary toolbar-btn"
          title="Add Text Overlay"
          onClick={() => {
            const store = useEditorStore.getState();
            // Find or create a text track
            let textTrack = store.tracks.find(t => t.type === 'text');
            if (!textTrack) {
              store.addTrack('text');
              textTrack = useEditorStore.getState().tracks.find(t => t.type === 'text');
            }
            if (textTrack) store.addTextClip(textTrack.id, store.playheadTime);
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 7 4 4 20 4 20 7"></polyline>
            <line x1="9" y1="20" x2="15" y2="20"></line>
            <line x1="12" y1="4" x2="12" y2="20"></line>
          </svg>
          Add Text
        </button>
        <button
          className="btn-secondary toolbar-btn"
          title="Add Caption Overlay"
          onClick={() => {
            const store = useEditorStore.getState();
            let textTrack = store.tracks.find(t => t.type === 'text');
            if (!textTrack) {
              store.addTrack('text');
              textTrack = useEditorStore.getState().tracks.find(t => t.type === 'text');
            }
            if (textTrack) store.addCaptionClip(textTrack.id, store.playheadTime);
          }}
        >
          <Captions size={12} />
          Add Caption
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
