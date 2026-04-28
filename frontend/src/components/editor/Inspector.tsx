import { useEditorStore } from '../../store/editorStore';

const formatDuration = (seconds: number): string => {
  if (isNaN(seconds) || !isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const formatSize = (bytes: number): string => {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
};

export const Inspector = () => {
  const { clips, tracks, selectedClipId, updateClipTransform, updateClipColor, updateClipAudio, exportSequence, isProcessing, srtDownloadUrl } = useEditorStore();

  const selectedClip = clips.find(c => c.id === selectedClipId);
  const track = selectedClip ? tracks.find(t => t.id === selectedClip.trackId) : null;

  const totalSequenceDuration = clips.reduce((max, clip) => {
    const end = clip.startTime + clip.duration;
    if (isNaN(end) || !isFinite(end)) return max;
    return Math.max(max, end);
  }, 0);

  return (
    <div className="panel properties-panel">
      <div className="panel-header">Inspector</div>
      <div className="panel-content">
        
        {/* Sequence Overview (Show when nothing is selected) */}
        {!selectedClip && (
          <>
            <div className="inspector-section">
              <div className="inspector-section-title">Sequence</div>
              <div className="inspector-row">
                <span className="inspector-label">Clips</span>
                <span className="inspector-value">{clips.length}</span>
              </div>
              <div className="inspector-row">
                <span className="inspector-label">Tracks</span>
                <span className="inspector-value">{tracks.length}</span>
              </div>
              <div className="inspector-row">
                <span className="inspector-label">Duration</span>
                <span className="inspector-value">{formatDuration(totalSequenceDuration)}</span>
              </div>
            </div>

            <div className="inspector-empty">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.5, marginBottom: '0.5rem' }}>
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
              </svg>
              Select a clip to inspect
            </div>
          </>
        )}

        {/* Clip Properties */}
        {selectedClip && (
          <div className="inspector-section">
            <div className="inspector-section-title">Clip Properties</div>
            <div className="inspector-row">
              <span className="inspector-label">Name</span>
              <span className="inspector-value truncate" title={selectedClip.file.name}>{selectedClip.file.name}</span>
            </div>
            <div className="inspector-row">
              <span className="inspector-label">Type</span>
              <span className="inspector-value" style={{ textTransform: 'capitalize' }}>{selectedClip.type}</span>
            </div>
            <div className="inspector-row">
              <span className="inspector-label">Track</span>
              <span className="inspector-value">{track?.name || '—'}</span>
            </div>
            <div className="inspector-row">
              <span className="inspector-label">Start</span>
              <span className="inspector-value">{formatDuration(selectedClip.startTime)}</span>
            </div>
            <div className="inspector-row">
              <span className="inspector-label">Duration</span>
              <span className="inspector-value">{formatDuration(selectedClip.duration)}</span>
            </div>
            <div className="inspector-row">
              <span className="inspector-label">Size</span>
              <span className="inspector-value">{formatSize(selectedClip.file.size)}</span>
            </div>
          </div>
        )}

        {/* Video Transform Controls */}
        {selectedClip && selectedClip.type === 'visual' && (
          <div className="inspector-section">
            <div className="inspector-section-title">Transform</div>
            
            {/* Scale */}
            <div className="inspector-control-group" style={{ marginBottom: '1rem' }}>
              <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                <span className="inspector-label">Scale</span>
                <span className="inspector-value">{Math.round(selectedClip.transform?.scale || 100)}%</span>
              </div>
              <input 
                type="range" 
                min="10" max="300" 
                value={selectedClip.transform?.scale || 100}
                onChange={(e) => updateClipTransform(selectedClip.id, { scale: Number(e.target.value) })}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>

            {/* Rotation */}
            <div className="inspector-control-group" style={{ marginBottom: '1rem' }}>
              <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                <span className="inspector-label">Rotation</span>
                <span className="inspector-value">{selectedClip.transform?.rotation || 0}°</span>
              </div>
              <input 
                type="range" 
                min="-180" max="180" 
                value={selectedClip.transform?.rotation || 0}
                onChange={(e) => updateClipTransform(selectedClip.id, { rotation: Number(e.target.value) })}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>

            {/* Flip Options */}
            <div className="inspector-row">
              <span className="inspector-label">Flip</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className={`btn-icon ${selectedClip.transform?.flipX ? 'active' : ''}`}
                  onClick={() => updateClipTransform(selectedClip.id, { flipX: !(selectedClip.transform?.flipX || false) })}
                  title="Flip Horizontal"
                  style={{ backgroundColor: selectedClip.transform?.flipX ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid var(--border-color)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="17 9 21 13 17 17"></polyline>
                    <polyline points="7 9 3 13 7 17"></polyline>
                    <line x1="21" y1="13" x2="13" y2="13"></line>
                    <line x1="3" y1="13" x2="11" y2="13"></line>
                    <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="4 4"></line>
                  </svg>
                </button>
                <button 
                  className={`btn-icon ${selectedClip.transform?.flipY ? 'active' : ''}`}
                  onClick={() => updateClipTransform(selectedClip.id, { flipY: !(selectedClip.transform?.flipY || false) })}
                  title="Flip Vertical"
                  style={{ backgroundColor: selectedClip.transform?.flipY ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid var(--border-color)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 17 11 21 7 17"></polyline>
                    <polyline points="15 7 11 3 7 7"></polyline>
                    <line x1="11" y1="21" x2="11" y2="13"></line>
                    <line x1="11" y1="3" x2="11" y2="11"></line>
                    <line x1="2" y1="12" x2="22" y2="12" strokeDasharray="4 4"></line>
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Reset Button */}
            <button 
              className="btn-secondary" 
              style={{ width: '100%', marginTop: '1rem', fontSize: '0.7rem' }}
              onClick={() => updateClipTransform(selectedClip.id, { scale: 100, rotation: 0, flipX: false, flipY: false })}
            >
              Reset Transform
            </button>
          </div>
        )}

        {/* Color Grading Controls */}
        {selectedClip && selectedClip.type === 'visual' && (
          <div className="inspector-section">
            <div className="inspector-section-title">Color Grading</div>

            {([
              { key: 'brightness', label: 'Brightness', min: 0, max: 200, unit: '%' },
              { key: 'contrast',   label: 'Contrast',   min: 0, max: 200, unit: '%' },
              { key: 'saturation', label: 'Saturation', min: 0, max: 200, unit: '%' },
              { key: 'exposure',   label: 'Exposure',   min: -100, max: 100, unit: '' },
              { key: 'temperature',label: 'Temperature',min: -100, max: 100, unit: '' },
            ] as const).map(({ key, label, min, max, unit }) => {
              const val = selectedClip.color?.[key] ?? (key === 'brightness' || key === 'contrast' || key === 'saturation' ? 100 : 0);
              return (
                <div key={key} className="inspector-control-group" style={{ marginBottom: '0.9rem' }}>
                  <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                    <span className="inspector-label">{label}</span>
                    <span className="inspector-value">{Math.round(val)}{unit}</span>
                  </div>
                  <input
                    type="range"
                    min={min} max={max}
                    value={val}
                    onChange={(e) => updateClipColor(selectedClip.id, { [key]: Number(e.target.value) })}
                    style={{ width: '100%', cursor: 'pointer' }}
                  />
                </div>
              );
            })}

            <button
              className="btn-secondary"
              style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.7rem' }}
              onClick={() => updateClipColor(selectedClip.id, { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0 })}
            >
              Reset Colors
            </button>
          </div>
        )}

        {/* Audio Controls — shown for every clip type */}
        {selectedClip && (
          <div className="inspector-section">
            <div className="inspector-section-title">Audio</div>

            {/* Volume */}
            <div className="inspector-control-group" style={{ marginBottom: '0.9rem' }}>
              <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                <span className="inspector-label">Volume</span>
                <span className="inspector-value">{Math.round(selectedClip.audio?.volume ?? 100)}%</span>
              </div>
              <input
                type="range" min={0} max={200}
                value={selectedClip.audio?.volume ?? 100}
                onChange={(e) => updateClipAudio(selectedClip.id, { volume: Number(e.target.value) })}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>

            {/* Mute */}
            <div className="inspector-row" style={{ marginBottom: '0.9rem' }}>
              <span className="inspector-label">Mute</span>
              <button
                className="btn-secondary"
                style={{
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.72rem',
                  backgroundColor: selectedClip.audio?.mute ? 'var(--error-color)' : undefined,
                  color: selectedClip.audio?.mute ? '#fff' : undefined,
                  borderColor: selectedClip.audio?.mute ? 'var(--error-color)' : undefined,
                }}
                onClick={() => updateClipAudio(selectedClip.id, { mute: !(selectedClip.audio?.mute ?? false) })}
              >
                {selectedClip.audio?.mute ? '🔇 Muted' : '🔊 Active'}
              </button>
            </div>

            {/* Fade In */}
            <div className="inspector-control-group" style={{ marginBottom: '0.9rem' }}>
              <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                <span className="inspector-label">Fade In</span>
                <span className="inspector-value">{(selectedClip.audio?.fadeIn ?? 0).toFixed(1)}s</span>
              </div>
              <input
                type="range" min={0} max={Math.min(5, selectedClip.duration / 2)} step={0.1}
                value={selectedClip.audio?.fadeIn ?? 0}
                onChange={(e) => updateClipAudio(selectedClip.id, { fadeIn: Number(e.target.value) })}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>

            {/* Fade Out */}
            <div className="inspector-control-group" style={{ marginBottom: '0.9rem' }}>
              <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                <span className="inspector-label">Fade Out</span>
                <span className="inspector-value">{(selectedClip.audio?.fadeOut ?? 0).toFixed(1)}s</span>
              </div>
              <input
                type="range" min={0} max={Math.min(5, selectedClip.duration / 2)} step={0.1}
                value={selectedClip.audio?.fadeOut ?? 0}
                onChange={(e) => updateClipAudio(selectedClip.id, { fadeOut: Number(e.target.value) })}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>

            <button
              className="btn-secondary"
              style={{ width: '100%', fontSize: '0.7rem' }}
              onClick={() => updateClipAudio(selectedClip.id, { volume: 100, mute: false, fadeIn: 0, fadeOut: 0 })}
            >
              Reset Audio
            </button>
          </div>
        )}

        {/* Export Section (Always pinned to bottom) */}
        <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
          <div className="inspector-section-title">Export</div>
          {srtDownloadUrl ? (
            <a href={srtDownloadUrl} download="subtitles.srt" style={{ textDecoration: 'none' }}>
              <button className="btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download Subtitles
              </button>
            </a>
          ) : (
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: 'center', margin: '0 0 0.5rem 0' }}>
              Export to compile the final video and generate SRT subtitles.
            </p>
          )}
          <button 
            className="btn-primary" 
            style={{ width: '100%', padding: '0.6rem', marginTop: srtDownloadUrl ? '0.5rem' : '0' }}
            onClick={exportSequence}
            disabled={isProcessing || clips.length === 0}
          >
            {isProcessing ? 'Processing...' : 'Export & Transcribe'}
          </button>
        </div>

      </div>
    </div>
  );
};
