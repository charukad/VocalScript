import { useEditorStore } from '../../store/editorStore';
import type { KeyframeProperty } from '../../types';

type KeyframeMeta = {
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
};

const KEYFRAME_META: Record<KeyframeProperty, KeyframeMeta> = {
  scale: { label: 'Scale', min: 10, max: 300, step: 1, unit: '%' },
  rotation: { label: 'Rotation', min: -180, max: 180, step: 1, unit: 'deg' },
  opacity: { label: 'Opacity', min: 0, max: 100, step: 1, unit: '%' },
  volume: { label: 'Volume', min: 0, max: 200, step: 1, unit: '%' },
};

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
  const {
    clips,
    tracks,
    selectedClipId,
    updateClipTransform,
    updateClipColor,
    updateClipAudio,
    updateClipText,
    setClipTiming,
    openExportModal,
    cancelExport,
    isProcessing,
    exportStatus,
    srtDownloadUrl,
    vttDownloadUrl,
    captions,
    updateCaptionText,
    createTextClipsFromCaptions,
    playheadTime,
    addKeyframe,
    updateKeyframe,
    removeKeyframe
  } = useEditorStore();

  const selectedClip = clips.find(c => c.id === selectedClipId);
  const track = selectedClip ? tracks.find(t => t.id === selectedClip.trackId) : null;
  const selectedClipTime = selectedClip
    ? Math.max(0, Math.min(selectedClip.duration, playheadTime - selectedClip.startTime))
    : 0;
  const hasPlayableAudio = Boolean(selectedClip && (selectedClip.type === 'audio' || (selectedClip.type === 'visual' && !selectedClip.file.type.startsWith('image'))));
  const keyframeProperties: KeyframeProperty[] = selectedClip
    ? [
        ...(selectedClip.type === 'visual' ? (['scale', 'rotation'] as KeyframeProperty[]) : []),
        ...(selectedClip.type === 'visual' || selectedClip.type === 'text' ? (['opacity'] as KeyframeProperty[]) : []),
        ...(hasPlayableAudio ? (['volume'] as KeyframeProperty[]) : []),
      ]
    : [];
  const sortedKeyframes = [...(selectedClip?.keyframes ?? [])].sort((a, b) => a.time - b.time || a.property.localeCompare(b.property));

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
            <div className="inspector-row" style={{ gap: '0.5rem', marginTop: '0.5rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Start Sec</div>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={Number(selectedClip.startTime.toFixed(2))}
                  onChange={e => setClipTiming(selectedClip.id, Number(e.target.value), selectedClip.duration)}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Duration Sec</div>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={Number(selectedClip.duration.toFixed(2))}
                  onChange={e => setClipTiming(selectedClip.id, selectedClip.startTime, Number(e.target.value))}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
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

            {/* Opacity */}
            <div className="inspector-control-group" style={{ marginBottom: '1rem' }}>
              <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                <span className="inspector-label">Opacity</span>
                <span className="inspector-value">{Math.round(selectedClip.transform?.opacity ?? 100)}%</span>
              </div>
              <input
                type="range"
                min="0" max="100"
                value={selectedClip.transform?.opacity ?? 100}
                onChange={(e) => updateClipTransform(selectedClip.id, { opacity: Number(e.target.value) })}
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
              onClick={() => updateClipTransform(selectedClip.id, { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false })}
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

        {/* Keyframe Controls */}
        {selectedClip && keyframeProperties.length > 0 && (
          <div className="inspector-section">
            <div className="inspector-section-title">Keyframes</div>
            <div className="inspector-row" style={{ marginBottom: '0.65rem' }}>
              <span className="inspector-label">Playhead In Clip</span>
              <span className="inspector-value">{selectedClipTime.toFixed(2)}s</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.45rem', marginBottom: '0.8rem' }}>
              {keyframeProperties.map(property => (
                <button
                  key={property}
                  className="btn-secondary"
                  style={{ fontSize: '0.68rem', padding: '0.4rem 0.35rem' }}
                  onClick={() => addKeyframe(selectedClip.id, property)}
                  title={`Add ${KEYFRAME_META[property].label} keyframe at the playhead`}
                >
                  Add {KEYFRAME_META[property].label}
                </button>
              ))}
            </div>

            {sortedKeyframes.length === 0 ? (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '0.5rem 0' }}>
                No keyframes on this clip
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {sortedKeyframes.map(keyframe => {
                  const meta = KEYFRAME_META[keyframe.property];
                  return (
                    <div key={keyframe.id} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 70px 28px', gap: '0.35rem', alignItems: 'center' }}>
                      <span className="inspector-label">{meta.label}</span>
                      <input
                        aria-label={`${meta.label} keyframe time`}
                        type="number"
                        min={0}
                        max={selectedClip.duration}
                        step={0.1}
                        value={Number(keyframe.time.toFixed(2))}
                        onChange={e => updateKeyframe(selectedClip.id, keyframe.id, { time: Number(e.target.value) })}
                        style={{ width: '100%', padding: '0.28rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '5px', color: 'var(--text-primary)', fontSize: '0.7rem' }}
                      />
                      <input
                        aria-label={`${meta.label} keyframe value`}
                        type="number"
                        min={meta.min}
                        max={meta.max}
                        step={meta.step}
                        value={Number(keyframe.value.toFixed(2))}
                        onChange={e => updateKeyframe(selectedClip.id, keyframe.id, { value: Number(e.target.value) })}
                        title={meta.unit}
                        style={{ width: '100%', padding: '0.28rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '5px', color: 'var(--text-primary)', fontSize: '0.7rem' }}
                      />
                      <button
                        className="btn-icon"
                        onClick={() => removeKeyframe(selectedClip.id, keyframe.id)}
                        title="Remove keyframe"
                        style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                      >
                        x
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Text Clip Controls */}
        {selectedClip?.type === 'text' && selectedClip.textData && (
          <div className="inspector-section">
            <div className="inspector-section-title">Text</div>

            {/* Content */}
            <div className="inspector-control-group" style={{ marginBottom: '0.9rem' }}>
              <div className="inspector-label" style={{ marginBottom: '0.3rem' }}>Content</div>
              <textarea
                value={selectedClip.textData.content}
                onChange={e => updateClipText(selectedClip.id, { content: e.target.value })}
                rows={3}
                style={{
                  width: '100%', resize: 'vertical', padding: '0.4rem 0.5rem',
                  background: 'var(--surface-3)', border: '1px solid var(--border-color)',
                  borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem',
                  fontFamily: 'inherit', boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Font & Size */}
            <div className="inspector-row" style={{ marginBottom: '0.9rem', gap: '0.5rem' }}>
              <div style={{ flex: 2 }}>
                <div className="inspector-label" style={{ marginBottom: '0.3rem' }}>Font</div>
                <select
                  value={selectedClip.textData.fontFamily}
                  onChange={e => updateClipText(selectedClip.id, { fontFamily: e.target.value })}
                  style={{
                    width: '100%', padding: '0.35rem', background: 'var(--surface-3)',
                    border: '1px solid var(--border-color)', borderRadius: '6px',
                    color: 'var(--text-primary)', fontSize: '0.75rem'
                  }}
                >
                  <option value="Inter, sans-serif">Inter</option>
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="'Courier New', monospace">Courier New</option>
                  <option value="Impact, sans-serif">Impact</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.3rem' }}>Size</div>
                <input
                  type="number" min={8} max={200}
                  value={selectedClip.textData.fontSize}
                  onChange={e => updateClipText(selectedClip.id, { fontSize: Number(e.target.value) })}
                  style={{
                    width: '100%', padding: '0.35rem', background: 'var(--surface-3)',
                    border: '1px solid var(--border-color)', borderRadius: '6px',
                    color: 'var(--text-primary)', fontSize: '0.75rem'
                  }}
                />
              </div>
            </div>

            {/* Style: Bold / Italic / Color */}
            <div className="inspector-row" style={{ marginBottom: '0.9rem' }}>
              <span className="inspector-label">Style</span>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <button
                  className="btn-secondary"
                  style={{ padding: '0.2rem 0.55rem', fontWeight: 700, fontSize: '0.85rem', background: selectedClip.textData.bold ? 'rgba(255,255,255,0.15)' : undefined }}
                  onClick={() => updateClipText(selectedClip.id, { bold: !selectedClip.textData!.bold })}
                >B</button>
                <button
                  className="btn-secondary"
                  style={{ padding: '0.2rem 0.55rem', fontStyle: 'italic', fontSize: '0.85rem', background: selectedClip.textData.italic ? 'rgba(255,255,255,0.15)' : undefined }}
                  onClick={() => updateClipText(selectedClip.id, { italic: !selectedClip.textData!.italic })}
                >I</button>
                <input
                  type="color" value={selectedClip.textData.color}
                  onChange={e => updateClipText(selectedClip.id, { color: e.target.value })}
                  style={{ width: '28px', height: '28px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
                  title="Text Color"
                />
              </div>
            </div>

            {/* Position X / Y */}
            <div className="inspector-control-group" style={{ marginBottom: '0.9rem' }}>
              <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                <span className="inspector-label">Position X</span>
                <span className="inspector-value">{selectedClip.textData.x}%</span>
              </div>
              <input type="range" min={0} max={100}
                value={selectedClip.textData.x}
                onChange={e => updateClipText(selectedClip.id, { x: Number(e.target.value) })}
                style={{ width: '100%' }} />
            </div>
            <div className="inspector-control-group" style={{ marginBottom: '0.9rem' }}>
              <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                <span className="inspector-label">Position Y</span>
                <span className="inspector-value">{selectedClip.textData.y}%</span>
              </div>
              <input type="range" min={0} max={100}
                value={selectedClip.textData.y}
                onChange={e => updateClipText(selectedClip.id, { y: Number(e.target.value) })}
                style={{ width: '100%' }} />
            </div>

            {/* Background Opacity */}
            <div className="inspector-control-group" style={{ marginBottom: '0.9rem' }}>
              <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                <span className="inspector-label">Background</span>
                <span className="inspector-value">{Math.round(selectedClip.textData.bgOpacity * 100)}%</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="color" value={selectedClip.textData.bgColor}
                  onChange={e => updateClipText(selectedClip.id, { bgColor: e.target.value })}
                  style={{ width: '28px', height: '28px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                />
                <input type="range" min={0} max={1} step={0.05}
                  value={selectedClip.textData.bgOpacity}
                  onChange={e => updateClipText(selectedClip.id, { bgOpacity: Number(e.target.value) })}
                  style={{ flex: 1 }} />
              </div>
            </div>
          </div>
        )}

        {/* Export Section */}
        <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
          <div className="inspector-section-title">Export</div>
          {exportStatus && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textAlign: 'center' }}>
              {exportStatus}
            </div>
          )}
          {srtDownloadUrl && (
            <a href={srtDownloadUrl} download="subtitles.srt" style={{ textDecoration: 'none' }}>
              <button className="btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download Subtitles
              </button>
            </a>
          )}
          {vttDownloadUrl && (
            <a href={vttDownloadUrl} download="subtitles.vtt" style={{ textDecoration: 'none' }}>
              <button className="btn-secondary" style={{ width: '100%', marginBottom: '0.5rem' }}>
                Download VTT
              </button>
            </a>
          )}
          <button
            className="btn-primary"
            style={{ width: '100%', padding: '0.6rem' }}
            onClick={openExportModal}
            disabled={isProcessing || clips.length === 0}
          >
            {isProcessing ? 'Processing...' : 'Export & Transcribe'}
          </button>
          {isProcessing && (
            <button className="btn-secondary" style={{ width: '100%', padding: '0.55rem', marginTop: '0.5rem' }} onClick={cancelExport}>
              Cancel Export
            </button>
          )}
        </div>

        {/* Captions Section */}
        {captions.length > 0 && (
          <div className="inspector-section" style={{ marginTop: '1rem' }}>
            <div className="inspector-section-title">Captions</div>
            <button
              className="btn-secondary"
              style={{ width: '100%', marginBottom: '0.65rem' }}
              onClick={createTextClipsFromCaptions}
            >
              Add Captions to Timeline
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {captions.map(caption => (
                <div key={caption.id} style={{ background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.65rem', marginBottom: '0.35rem' }}>
                    {caption.index}. {formatDuration(caption.start)} - {formatDuration(caption.end)}
                  </div>
                  <textarea
                    value={caption.text}
                    rows={2}
                    onChange={e => updateCaptionText(caption.id, e.target.value)}
                    style={{ width: '100%', resize: 'vertical', background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', padding: '0.4rem', fontFamily: 'inherit', fontSize: '0.75rem' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
