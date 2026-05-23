import { useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { KeyframeEasing, KeyframeProperty } from '../../types';
import {
  buildBrollSuggestions,
  buildTranscriptInsights,
  getShortDraftCandidates,
  transcriptInsightsToMarkers,
} from '../../lib/utils/editorInsights';
import { StatusState } from '../ui/StatusState';

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
  x: { label: 'X Position', min: -50, max: 150, step: 1, unit: '%' },
  y: { label: 'Y Position', min: -50, max: 150, step: 1, unit: '%' },
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

type InspectorTab = 'basic' | 'animation' | 'audio' | 'color' | 'captions' | 'assist';

const INSPECTOR_TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: 'basic', label: 'Basic' },
  { id: 'animation', label: 'Animation' },
  { id: 'audio', label: 'Audio' },
  { id: 'color', label: 'Color' },
  { id: 'captions', label: 'Captions' },
  { id: 'assist', label: 'Assist' },
];

const EASING_OPTIONS: Array<{ value: KeyframeEasing; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease_in', label: 'Ease In' },
  { value: 'ease_out', label: 'Ease Out' },
  { value: 'ease_in_out', label: 'Ease In Out' },
];

const TEXT_PRESETS = [
  {
    id: 'title',
    label: 'Title',
    patch: {
      fontSize: 62,
      bold: true,
      y: 24,
      bgOpacity: 0,
      strokeWidth: 1,
      shadowOpacity: 0.72,
      maxWidthPercent: 84,
      maxCharsPerLine: 24,
    },
  },
  {
    id: 'subtitle',
    label: 'Subtitle',
    patch: {
      fontSize: 40,
      bold: false,
      y: 78,
      bgOpacity: 0.2,
      strokeWidth: 0,
      shadowOpacity: 0.55,
      maxWidthPercent: 78,
      maxCharsPerLine: 30,
    },
  },
  {
    id: 'caption',
    label: 'Social Caption',
    patch: {
      fontSize: 42,
      bold: true,
      y: 82,
      bgOpacity: 0.45,
      strokeWidth: 0,
      shadowOpacity: 0.5,
      maxWidthPercent: 82,
      maxCharsPerLine: 26,
    },
  },
  {
    id: 'lower_third',
    label: 'Lower Third',
    patch: {
      fontSize: 34,
      bold: true,
      align: 'left' as const,
      x: 18,
      y: 84,
      bgOpacity: 0.68,
      boxRadius: 8,
      maxWidthPercent: 56,
      maxCharsPerLine: 28,
    },
  },
] as const;

const COLOR_LOOK_PRESETS = [
  {
    id: 'clean',
    label: 'Clean',
    color: { brightness: 100, contrast: 105, saturation: 102, exposure: 0, temperature: 0 },
    effects: { blur: 0, sharpen: 8, vignette: 0, clarity: 8 },
  },
  {
    id: 'punchy',
    label: 'Punchy',
    color: { brightness: 102, contrast: 118, saturation: 118, exposure: 2, temperature: 4 },
    effects: { blur: 0, sharpen: 16, vignette: 10, clarity: 14 },
  },
  {
    id: 'warm',
    label: 'Warm',
    color: { brightness: 102, contrast: 108, saturation: 108, exposure: 1, temperature: 24 },
    effects: { blur: 0, sharpen: 8, vignette: 16, clarity: 8 },
  },
  {
    id: 'cool',
    label: 'Cool',
    color: { brightness: 100, contrast: 110, saturation: 104, exposure: 0, temperature: -22 },
    effects: { blur: 0, sharpen: 10, vignette: 12, clarity: 10 },
  },
  {
    id: 'mono',
    label: 'Mono',
    color: { brightness: 102, contrast: 118, saturation: 0, exposure: 0, temperature: 0 },
    effects: { blur: 0, sharpen: 12, vignette: 22, clarity: 10 },
  },
] as const;

const TRANSITION_PRESETS = [
  { id: 'cut', label: 'Cut' },
  { id: 'fade', label: 'Fade' },
  { id: 'crossfade', label: 'Crossfade' },
  { id: 'slide_left', label: 'Slide Left' },
  { id: 'slide_right', label: 'Slide Right' },
  { id: 'wipe', label: 'Wipe' },
] as const;

const LAYOUT_PRESETS = [
  { id: 'free', label: 'Free', patch: { x: 50, y: 50, scale: 100 } },
  { id: 'pip_top_right', label: 'PIP Top Right', patch: { x: 76, y: 24, scale: 38 } },
  { id: 'pip_bottom_left', label: 'PIP Bottom Left', patch: { x: 24, y: 76, scale: 38 } },
  { id: 'split_left', label: 'Split Left', patch: { x: 25, y: 50, scale: 72 } },
  { id: 'split_right', label: 'Split Right', patch: { x: 75, y: 50, scale: 72 } },
] as const;

const TITLE_ANIMATION_PRESETS = [
  { id: 'none', label: 'Static' },
  { id: 'pop', label: 'Pop' },
  { id: 'slide_up', label: 'Slide Up' },
  { id: 'drift', label: 'Drift' },
] as const;

export const Inspector = () => {
  const {
    clips,
    tracks,
    selectedClipId,
    updateClipTransform,
    updateClipPosition,
    updateClipCrop,
    updateClipColor,
    updateClipEffects,
    updateClipSpeed,
    updateClipTransition,
    updateClipCompositing,
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
    transcriptLanguage,
    setTranscriptLanguage,
    updateCaptionText,
    createTextClipsFromCaptions,
    transcribeSelectedMedia,
    playheadTime,
    setPlayheadTime,
    addKeyframe,
    updateKeyframe,
    removeKeyframe,
    applyMotionPreset,
    copyKeyframes,
    pasteKeyframes,
    copiedKeyframes,
    addMarkers,
    createBeatMarkersFromClip,
    splitSelectedClipAtCaptionBoundaries,
    buildTranscriptRoughCut,
    appendBestShortDraft,
    alignSelectedClipSpeechToPlayhead,
    setExportSettings,
  } = useEditorStore();
  const [activeTab, setActiveTab] = useState<InspectorTab>('basic');
  const [audioStatus, setAudioStatus] = useState<string | null>(null);
  const [assistStatus, setAssistStatus] = useState<string | null>(null);

  const selectedClip = clips.find(c => c.id === selectedClipId);
  const track = selectedClip ? tracks.find(t => t.id === selectedClip.trackId) : null;
  const selectedClipTime = selectedClip
    ? Math.max(0, Math.min(selectedClip.duration, playheadTime - selectedClip.startTime))
    : 0;
  const hasPlayableAudio = Boolean(selectedClip && (selectedClip.type === 'audio' || (selectedClip.type === 'visual' && !selectedClip.file.type.startsWith('image'))));
  const hasTranscriptSource = clips.some(clip => {
    if (clip.type === 'audio') return true;
    if (clip.type !== 'visual') return false;
    const fileType = clip.file.type.toLowerCase();
    const fileName = clip.file.name.toLowerCase();
    return !(fileType.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(fileName));
  });
  const keyframeProperties: KeyframeProperty[] = selectedClip
    ? [
        ...(selectedClip.type === 'visual' ? (['scale', 'rotation'] as KeyframeProperty[]) : []),
        ...(selectedClip.type === 'visual' || selectedClip.type === 'text' ? (['opacity'] as KeyframeProperty[]) : []),
        ...(selectedClip.type === 'visual' || selectedClip.type === 'text' ? (['x', 'y'] as KeyframeProperty[]) : []),
        ...(hasPlayableAudio ? (['volume'] as KeyframeProperty[]) : []),
      ]
    : [];
  const sortedKeyframes = [...(selectedClip?.keyframes ?? [])].sort((a, b) => a.time - b.time || a.property.localeCompare(b.property));
  const availableTabs = new Set<InspectorTab>([
    'basic',
    ...(selectedClip && keyframeProperties.length > 0 ? ['animation' as const] : []),
    ...(selectedClip ? ['audio' as const] : []),
    ...(selectedClip?.type === 'visual' ? ['color' as const] : []),
    'captions',
    ...(captions.length > 0 ? ['assist' as const] : []),
  ]);
  const displayedTab = availableTabs.has(activeTab) ? activeTab : 'basic';

  const totalSequenceDuration = clips.reduce((max, clip) => {
    const end = clip.startTime + clip.duration;
    if (isNaN(end) || !isFinite(end)) return max;
    return Math.max(max, end);
  }, 0);
  const transcriptInsights = buildTranscriptInsights(captions, totalSequenceDuration);
  const brollSuggestions = buildBrollSuggestions(captions);
  const shortCandidates = getShortDraftCandidates(captions, 45);

  return (
    <div className="panel properties-panel">
      <div className="panel-header">Inspector</div>
      <div className="inspector-tabs" role="tablist" aria-label="Inspector sections">
        {INSPECTOR_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={displayedTab === tab.id}
            className={displayedTab === tab.id ? 'active' : ''}
            disabled={!availableTabs.has(tab.id)}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="panel-content">
        
        {/* Sequence Overview (Show when nothing is selected) */}
        {displayedTab === 'basic' && !selectedClip && (
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
              <StatusState
                title="Select a clip to inspect"
                body="Clip-specific controls appear here when a timeline item is selected."
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.5 }}>
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                    <polyline points="10 17 15 12 10 7"></polyline>
                    <line x1="15" y1="12" x2="3" y2="12"></line>
                  </svg>
                }
              />
            </div>
          </>
        )}

        {/* Clip Properties */}
        {displayedTab === 'basic' && selectedClip && (
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
        {displayedTab === 'basic' && selectedClip && selectedClip.type === 'visual' && (
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

            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '1rem' }}>
              {([
                { axis: 'x' as const, label: 'X', value: selectedClip.transform?.x ?? selectedClip.animation?.x ?? 50 },
                { axis: 'y' as const, label: 'Y', value: selectedClip.transform?.y ?? selectedClip.animation?.y ?? 50 },
              ]).map(control => (
                <div key={control.axis} style={{ flex: 1 }}>
                  <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>{control.label} Position</div>
                  <input
                    type="number"
                    min={-50}
                    max={150}
                    step={1}
                    value={Number(control.value.toFixed(1))}
                    onChange={event => updateClipPosition(
                      selectedClip.id,
                      control.axis === 'x' ? Number(event.target.value) : selectedClip.transform?.x ?? selectedClip.animation?.x ?? 50,
                      control.axis === 'y' ? Number(event.target.value) : selectedClip.transform?.y ?? selectedClip.animation?.y ?? 50,
                    )}
                    style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                  />
                </div>
              ))}
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

            <div className="inspector-section-title" style={{ marginTop: '1rem' }}>Crop</div>
            {(['left', 'right', 'top', 'bottom'] as const).map(edge => (
              <div key={edge} className="inspector-control-group" style={{ marginBottom: '0.75rem' }}>
                <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                  <span className="inspector-label" style={{ textTransform: 'capitalize' }}>{edge}</span>
                  <span className="inspector-value">{selectedClip.crop?.[edge] ?? 0}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={45}
                  value={selectedClip.crop?.[edge] ?? 0}
                  onChange={event => updateClipCrop(selectedClip.id, { [edge]: Number(event.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>
            ))}

            <button
              className="btn-secondary"
              style={{ width: '100%', marginTop: '0.25rem', fontSize: '0.7rem' }}
              onClick={() => updateClipCrop(selectedClip.id, { left: 0, right: 0, top: 0, bottom: 0 })}
            >
              Reset Crop
            </button>

            <div className="inspector-section-title" style={{ marginTop: '1rem' }}>Speed</div>
            <div className="inspector-control-group" style={{ marginBottom: '0.8rem' }}>
              <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                <span className="inspector-label">Rate</span>
                <span className="inspector-value">{(selectedClip.speed?.rate ?? 1).toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.25}
                max={4}
                step={0.05}
                value={selectedClip.speed?.rate ?? 1}
                onChange={event => updateClipSpeed(selectedClip.id, { rate: Number(event.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <div className="speed-preset-grid">
              {[0.5, 1, 1.5, 2].map(rate => (
                <button key={rate} className="btn-secondary" onClick={() => updateClipSpeed(selectedClip.id, { rate })}>
                  {rate}x
                </button>
              ))}
            </div>
            <div className="toggle-row-grid">
              <label>
                <input
                  type="checkbox"
                  checked={selectedClip.speed?.reverse ?? false}
                  onChange={event => updateClipSpeed(selectedClip.id, { reverse: event.target.checked })}
                />
                Reverse
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selectedClip.speed?.freezeFrame ?? false}
                  onChange={event => updateClipSpeed(selectedClip.id, { freezeFrame: event.target.checked })}
                />
                Freeze frame
              </label>
            </div>
            <select
              value={selectedClip.speed?.curvePreset ?? 'constant'}
              onChange={event => updateClipSpeed(selectedClip.id, { curvePreset: event.target.value as NonNullable<typeof selectedClip.speed>['curvePreset'] })}
              style={{ width: '100%', marginTop: '0.5rem', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
            >
              <option value="constant">Constant</option>
              <option value="ramp_up">Ramp Up</option>
              <option value="ramp_down">Ramp Down</option>
            </select>
          </div>
        )}

        {/* Color Grading Controls */}
        {displayedTab === 'color' && selectedClip && selectedClip.type === 'visual' && (
          <div className="inspector-section">
            <div className="inspector-section-title">Color Grading</div>

            <div className="inspector-subsection-label">Looks</div>
            <div className="color-look-grid">
              {COLOR_LOOK_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  className="btn-secondary"
                  onClick={() => {
                    updateClipColor(selectedClip.id, preset.color);
                    updateClipEffects(selectedClip.id, preset.effects);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {([
              { key: 'brightness', label: 'Brightness', min: 0, max: 200, unit: '%' },
              { key: 'contrast',   label: 'Contrast',   min: 0, max: 200, unit: '%' },
              { key: 'saturation', label: 'Saturation', min: 0, max: 200, unit: '%' },
              { key: 'exposure',   label: 'Exposure',   min: -100, max: 100, unit: '' },
              { key: 'temperature',label: 'Temperature',min: -100, max: 100, unit: '' },
              { key: 'highlights', label: 'Highlights', min: -100, max: 100, unit: '' },
              { key: 'shadows', label: 'Shadows', min: -100, max: 100, unit: '' },
              { key: 'red', label: 'Red', min: -100, max: 100, unit: '' },
              { key: 'green', label: 'Green', min: -100, max: 100, unit: '' },
              { key: 'blue', label: 'Blue', min: -100, max: 100, unit: '' },
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

            <div className="inspector-subsection-label" style={{ marginTop: '0.35rem' }}>Finishing</div>
            {([
              { key: 'blur', label: 'Blur', min: 0, max: 20, step: 0.5, unit: 'px' },
              { key: 'sharpen', label: 'Sharpen', min: 0, max: 100, step: 1, unit: '%' },
              { key: 'vignette', label: 'Vignette', min: 0, max: 100, step: 1, unit: '%' },
              { key: 'clarity', label: 'Clarity', min: -100, max: 100, step: 1, unit: '%' },
            ] as const).map(({ key, label, min, max, step, unit }) => {
              const val = selectedClip.effects?.[key] ?? 0;
              return (
                <div key={key} className="inspector-control-group" style={{ marginBottom: '0.9rem' }}>
                  <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                    <span className="inspector-label">{label}</span>
                    <span className="inspector-value">{Number(val.toFixed(1))}{unit}</span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={val}
                    onChange={event => updateClipEffects(selectedClip.id, { [key]: Number(event.target.value) })}
                    style={{ width: '100%', cursor: 'pointer' }}
                  />
                </div>
              );
            })}

            <div className="inspector-subsection-label" style={{ marginTop: '0.35rem' }}>Overlays</div>
            <select
              value={selectedClip.effects?.overlayPreset ?? 'none'}
              onChange={event => updateClipEffects(selectedClip.id, { overlayPreset: event.target.value as NonNullable<typeof selectedClip.effects>['overlayPreset'] })}
              style={{ width: '100%', marginBottom: '0.6rem', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
            >
              <option value="none">None</option>
              <option value="glitch">Glitch</option>
              <option value="vhs">VHS</option>
              <option value="light_leak">Light Leak</option>
            </select>
            <div className="inspector-control-group" style={{ marginBottom: '0.9rem' }}>
              <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                <span className="inspector-label">Overlay Intensity</span>
                <span className="inspector-value">{selectedClip.effects?.overlayIntensity ?? 0}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={selectedClip.effects?.overlayIntensity ?? 0}
                onChange={event => updateClipEffects(selectedClip.id, { overlayIntensity: Number(event.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <div className="inspector-subsection-label" style={{ marginTop: '0.35rem' }}>Compositing</div>
            <div className="transition-preset-grid">
              {LAYOUT_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  className="btn-secondary"
                  onClick={() => {
                    updateClipCompositing(selectedClip.id, { layoutPreset: preset.id });
                    updateClipTransform(selectedClip.id, { scale: preset.patch.scale });
                    updateClipPosition(selectedClip.id, preset.patch.x, preset.patch.y);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Blend</div>
                <select
                  value={selectedClip.compositing?.blendMode ?? 'normal'}
                  onChange={event => updateClipCompositing(selectedClip.id, { blendMode: event.target.value as NonNullable<typeof selectedClip.compositing>['blendMode'] })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                >
                  <option value="normal">Normal</option>
                  <option value="screen">Screen</option>
                  <option value="multiply">Multiply</option>
                  <option value="overlay">Overlay</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Mask</div>
                <select
                  value={selectedClip.compositing?.maskShape ?? 'none'}
                  onChange={event => updateClipCompositing(selectedClip.id, { maskShape: event.target.value as NonNullable<typeof selectedClip.compositing>['maskShape'] })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                >
                  <option value="none">None</option>
                  <option value="circle">Circle</option>
                  <option value="rounded">Rounded</option>
                </select>
              </div>
            </div>
            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Border</div>
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={selectedClip.compositing?.borderWidth ?? 0}
                  onChange={event => updateClipCompositing(selectedClip.id, { borderWidth: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Border Color</div>
                <input
                  type="color"
                  value={selectedClip.compositing?.borderColor ?? '#ffffff'}
                  onChange={event => updateClipCompositing(selectedClip.id, { borderColor: event.target.value })}
                  style={{ width: '100%', height: '32px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
                />
              </div>
            </div>
            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Corner Radius</div>
                <input
                  type="number"
                  min={0}
                  max={160}
                  value={selectedClip.compositing?.cornerRadius ?? 0}
                  onChange={event => updateClipCompositing(selectedClip.id, { cornerRadius: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div className="inspector-subsection-label" style={{ marginTop: '0.35rem' }}>Cleanup</div>
            <div className="toggle-row-grid">
              <label>
                <input
                  type="checkbox"
                  checked={selectedClip.compositing?.chromaKeyEnabled ?? false}
                  onChange={event => updateClipCompositing(selectedClip.id, { chromaKeyEnabled: event.target.checked })}
                />
                Chroma key
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selectedClip.compositing?.stabilization ?? false}
                  onChange={event => updateClipCompositing(selectedClip.id, { stabilization: event.target.checked })}
                />
                Stabilize
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selectedClip.compositing?.backgroundRemoval ?? false}
                  onChange={event => updateClipCompositing(selectedClip.id, { backgroundRemoval: event.target.checked })}
                />
                BG remove hook
              </label>
            </div>
            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '0.75rem', marginTop: '0.65rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Key Color</div>
                <input
                  type="color"
                  value={selectedClip.compositing?.chromaKeyColor ?? '#00ff00'}
                  onChange={event => updateClipCompositing(selectedClip.id, { chromaKeyColor: event.target.value })}
                  style={{ width: '100%', height: '32px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Similarity</div>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={selectedClip.compositing?.chromaKeySimilarity ?? 0.2}
                  onChange={event => updateClipCompositing(selectedClip.id, { chromaKeySimilarity: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Spill</div>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={selectedClip.compositing?.spillSuppression ?? 0}
                  onChange={event => updateClipCompositing(selectedClip.id, { spillSuppression: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Edge Feather</div>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={selectedClip.compositing?.edgeFeather ?? 0}
                  onChange={event => updateClipCompositing(selectedClip.id, { edgeFeather: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div className="inspector-subsection-label" style={{ marginTop: '0.35rem' }}>Transitions</div>
            <div className="transition-preset-grid">
              {TRANSITION_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  className={`btn-secondary ${selectedClip.transition?.type === preset.id ? 'active' : ''}`}
                  onClick={() => updateClipTransition(selectedClip.id, {
                    type: preset.id,
                    duration: preset.id === 'cut' ? 0 : Math.max(0.25, selectedClip.transition?.duration ?? 0.35),
                  })}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="inspector-control-group">
              <div className="inspector-row" style={{ paddingBottom: '0.2rem' }}>
                <span className="inspector-label">Transition Duration</span>
                <span className="inspector-value">{(selectedClip.transition?.duration ?? 0).toFixed(2)}s</span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={selectedClip.transition?.duration ?? 0}
                onChange={event => updateClipTransition(selectedClip.id, { duration: Number(event.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <button
              className="btn-secondary"
              style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.7rem' }}
              onClick={() => {
                updateClipColor(selectedClip.id, { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0, highlights: 0, shadows: 0, red: 0, green: 0, blue: 0 });
                updateClipEffects(selectedClip.id, { blur: 0, sharpen: 0, vignette: 0, clarity: 0, overlayPreset: 'none', overlayIntensity: 0 });
                updateClipCompositing(selectedClip.id, { ...{
                  blendMode: 'normal',
                  layoutPreset: 'free',
                  borderWidth: 0,
                  borderColor: '#ffffff',
                  maskShape: 'none',
                  cornerRadius: 0,
                  chromaKeyEnabled: false,
                  chromaKeyColor: '#00ff00',
                  chromaKeySimilarity: 0.2,
                  spillSuppression: 0,
                  edgeFeather: 0,
                  stabilization: false,
                  backgroundRemoval: false,
                } });
              }}
            >
              Reset Color & Effects
            </button>
          </div>
        )}

        {/* Audio Controls — shown for every clip type */}
        {displayedTab === 'audio' && selectedClip && (
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
              <select
                value={selectedClip.audio?.fadeInCurve ?? 'linear'}
                onChange={event => updateClipAudio(selectedClip.id, { fadeInCurve: event.target.value as NonNullable<typeof selectedClip.audio>['fadeInCurve'] })}
                style={{ width: '100%', marginTop: '0.4rem', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
              >
                <option value="linear">Linear</option>
                <option value="ease_in">Ease In</option>
                <option value="ease_out">Ease Out</option>
                <option value="smooth">Smooth</option>
              </select>
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
              <select
                value={selectedClip.audio?.fadeOutCurve ?? 'linear'}
                onChange={event => updateClipAudio(selectedClip.id, { fadeOutCurve: event.target.value as NonNullable<typeof selectedClip.audio>['fadeOutCurve'] })}
                style={{ width: '100%', marginTop: '0.4rem', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
              >
                <option value="linear">Linear</option>
                <option value="ease_in">Ease In</option>
                <option value="ease_out">Ease Out</option>
                <option value="smooth">Smooth</option>
              </select>
            </div>

            <div className="inspector-section-title" style={{ marginTop: '1rem' }}>Processing</div>
            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '0.9rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>EQ Preset</div>
                <select
                  value={selectedClip.audio?.eqPreset ?? 'flat'}
                  onChange={event => updateClipAudio(selectedClip.id, { eqPreset: event.target.value as NonNullable<typeof selectedClip.audio>['eqPreset'] })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                >
                  <option value="flat">Flat</option>
                  <option value="voice">Voice</option>
                  <option value="music">Music</option>
                  <option value="bass_boost">Bass Boost</option>
                  <option value="bright">Bright</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Noise Reduction</div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={selectedClip.audio?.noiseReduction ?? 0}
                  onChange={event => updateClipAudio(selectedClip.id, { noiseReduction: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
            <div className="toggle-row-grid" style={{ marginBottom: '0.9rem' }}>
              <label>
                <input
                  type="checkbox"
                  checked={selectedClip.audio?.voiceEnhancement ?? false}
                  onChange={event => updateClipAudio(selectedClip.id, { voiceEnhancement: event.target.checked })}
                />
                Voice enhance
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selectedClip.audio?.autoDucking ?? true}
                  onChange={event => updateClipAudio(selectedClip.id, { autoDucking: event.target.checked })}
                />
                Auto duck
              </label>
            </div>
            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '0.9rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Mix Role</div>
                <select
                  value={selectedClip.audio?.duckingRole ?? 'none'}
                  onChange={event => updateClipAudio(selectedClip.id, { duckingRole: event.target.value as NonNullable<typeof selectedClip.audio>['duckingRole'] })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                >
                  <option value="none">None</option>
                  <option value="narration">Narration</option>
                  <option value="bed">Music Bed</option>
                </select>
              </div>
            </div>

            {selectedClip.type === 'audio' && (
              <div className="inspector-control-group" style={{ marginBottom: '0.9rem' }}>
                <button
                  className="btn-secondary"
                  style={{ width: '100%' }}
                  onClick={() => {
                    const count = createBeatMarkersFromClip(selectedClip.id);
                    setAudioStatus(count > 0 ? `Added ${count} beat marker${count === 1 ? '' : 's'}.` : 'No strong beat candidates found on this clip.');
                  }}
                >
                  Create Beat Markers
                </button>
                {audioStatus && (
                  <div className="inspector-helper-text">{audioStatus}</div>
                )}
              </div>
            )}

            <button
              className="btn-secondary"
              style={{ width: '100%', fontSize: '0.7rem' }}
              onClick={() => updateClipAudio(selectedClip.id, {
                volume: 100,
                mute: false,
                fadeIn: 0,
                fadeOut: 0,
                fadeInCurve: 'linear',
                fadeOutCurve: 'linear',
                eqPreset: 'flat',
                voiceEnhancement: false,
                noiseReduction: 0,
                duckingRole: 'none',
                autoDucking: true,
              })}
            >
              Reset Audio
            </button>
          </div>
        )}

        {/* Keyframe Controls */}
        {displayedTab === 'animation' && selectedClip && keyframeProperties.length > 0 && (
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

            <div className="motion-preset-grid">
              {([
                { id: 'push_in' as const, label: 'Push In' },
                { id: 'pop' as const, label: 'Pop' },
                { id: 'drift' as const, label: 'Drift' },
              ]).map(preset => (
                <button
                  key={preset.id}
                  className="btn-secondary"
                  onClick={() => applyMotionPreset(selectedClip.id, preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="keyframe-clipboard-actions">
              <button className="btn-secondary" onClick={() => copyKeyframes(selectedClip.id)}>
                Copy Keyframes
              </button>
              <button className="btn-secondary" disabled={!copiedKeyframes?.length} onClick={() => pasteKeyframes(selectedClip.id)}>
                Paste Keyframes
              </button>
            </div>

            {sortedKeyframes.length > 1 && (
              <div className="keyframe-curve-preview">
                <svg viewBox="0 0 100 42" preserveAspectRatio="none" aria-label="Keyframe curve preview">
                  {keyframeProperties.map(property => {
                    const frames = sortedKeyframes.filter(keyframe => keyframe.property === property);
                    if (frames.length < 2) return null;
                    const meta = KEYFRAME_META[property];
                    const points = frames.map(keyframe => {
                      const x = (keyframe.time / Math.max(selectedClip.duration, 0.001)) * 100;
                      const y = 40 - ((keyframe.value - meta.min) / Math.max(1, meta.max - meta.min)) * 36;
                      return `${x},${Math.max(2, Math.min(40, y))}`;
                    }).join(' ');
                    return <polyline key={property} points={points} />;
                  })}
                </svg>
              </div>
            )}

            {sortedKeyframes.length === 0 ? (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '0.5rem 0' }}>
                No keyframes on this clip
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {sortedKeyframes.map(keyframe => {
                  const meta = KEYFRAME_META[keyframe.property];
                  return (
                    <div key={keyframe.id} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 70px 92px 28px', gap: '0.35rem', alignItems: 'center' }}>
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
                      <select
                        aria-label={`${meta.label} keyframe easing`}
                        value={keyframe.easing}
                        onChange={event => updateKeyframe(selectedClip.id, keyframe.id, { easing: event.target.value as KeyframeEasing })}
                        style={{ width: '100%', padding: '0.28rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '5px', color: 'var(--text-primary)', fontSize: '0.7rem' }}
                      >
                        {EASING_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
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
        {displayedTab === 'basic' && selectedClip?.type === 'text' && selectedClip.textData && (
          <div className="inspector-section">
            <div className="inspector-section-title">Text</div>

            <div className="text-preset-grid">
              {TEXT_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  className="btn-secondary"
                  onClick={() => updateClipText(selectedClip.id, preset.patch)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="inspector-control-group" style={{ marginBottom: '0.9rem' }}>
              <div className="inspector-label" style={{ marginBottom: '0.35rem' }}>Title Animation</div>
              <div className="text-preset-grid">
                {TITLE_ANIMATION_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    className={`btn-secondary ${selectedClip.textData?.titleAnimation === preset.id ? 'active' : ''}`}
                    onClick={() => {
                      updateClipText(selectedClip.id, { titleAnimation: preset.id });
                      if (preset.id === 'pop' || preset.id === 'drift') {
                        applyMotionPreset(selectedClip.id, preset.id === 'pop' ? 'pop' : 'drift');
                      } else if (preset.id === 'slide_up') {
                        addKeyframe(selectedClip.id, 'y', 0, Math.min(100, (selectedClip.textData?.y ?? 50) + 12));
                        addKeyframe(selectedClip.id, 'y', Math.min(0.45, selectedClip.duration), selectedClip.textData?.y ?? 50);
                        addKeyframe(selectedClip.id, 'opacity', 0, 0);
                        addKeyframe(selectedClip.id, 'opacity', Math.min(0.35, selectedClip.duration), 100);
                      }
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

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

            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '0.9rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Caption Mode</div>
                <select
                  value={selectedClip.textData.captionMode ?? 'standard'}
                  onChange={event => updateClipText(selectedClip.id, { captionMode: event.target.value as NonNullable<typeof selectedClip.textData>['captionMode'] })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                >
                  <option value="standard">Standard</option>
                  <option value="karaoke">Karaoke</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Highlight</div>
                <input
                  type="color"
                  value={selectedClip.textData.highlightColor ?? '#f7d26a'}
                  onChange={event => updateClipText(selectedClip.id, { highlightColor: event.target.value })}
                  style={{ width: '100%', height: '32px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
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

            <div className="inspector-control-group" style={{ marginBottom: '0.9rem' }}>
              <div className="inspector-label" style={{ marginBottom: '0.35rem' }}>Safe Placement</div>
              <div className="safe-placement-grid">
                <button className="btn-secondary" onClick={() => updateClipText(selectedClip.id, { x: 50, y: 22, align: 'center' })}>
                  Top Safe
                </button>
                <button className="btn-secondary" onClick={() => updateClipText(selectedClip.id, { x: 50, y: 50, align: 'center' })}>
                  Center
                </button>
                <button className="btn-secondary" onClick={() => updateClipText(selectedClip.id, { x: 50, y: 82, align: 'center' })}>
                  Lower Safe
                </button>
              </div>
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

            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '0.9rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Box Padding</div>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={selectedClip.textData.boxPadding ?? 14}
                  onChange={event => updateClipText(selectedClip.id, { boxPadding: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Box Radius</div>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={selectedClip.textData.boxRadius ?? 10}
                  onChange={event => updateClipText(selectedClip.id, { boxRadius: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '0.9rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Max Width</div>
                <input
                  type="number"
                  min={20}
                  max={100}
                  value={selectedClip.textData.maxWidthPercent ?? 82}
                  onChange={event => updateClipText(selectedClip.id, { maxWidthPercent: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Chars / Line</div>
                <input
                  type="number"
                  min={8}
                  max={80}
                  value={selectedClip.textData.maxCharsPerLine ?? 28}
                  onChange={event => updateClipText(selectedClip.id, { maxCharsPerLine: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div className="inspector-section-title" style={{ marginTop: '1rem' }}>Outline & Shadow</div>
            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '0.9rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Stroke</div>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={selectedClip.textData.strokeWidth ?? 0}
                  onChange={event => updateClipText(selectedClip.id, { strokeWidth: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Stroke Color</div>
                <input
                  type="color"
                  value={selectedClip.textData.strokeColor ?? '#000000'}
                  onChange={event => updateClipText(selectedClip.id, { strokeColor: event.target.value })}
                  style={{ width: '100%', height: '32px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
                />
              </div>
            </div>

            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '0.9rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Shadow Color</div>
                <input
                  type="color"
                  value={selectedClip.textData.shadowColor ?? '#000000'}
                  onChange={event => updateClipText(selectedClip.id, { shadowColor: event.target.value })}
                  style={{ width: '100%', height: '32px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Shadow Opacity</div>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedClip.textData.shadowOpacity ?? 0.6}
                  onChange={event => updateClipText(selectedClip.id, { shadowOpacity: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '0.9rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Shadow Blur</div>
                <input
                  type="number"
                  min={0}
                  max={40}
                  value={selectedClip.textData.shadowBlur ?? 6}
                  onChange={event => updateClipText(selectedClip.id, { shadowBlur: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Shadow X</div>
                <input
                  type="number"
                  min={-40}
                  max={40}
                  value={selectedClip.textData.shadowOffsetX ?? 0}
                  onChange={event => updateClipText(selectedClip.id, { shadowOffsetX: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div className="inspector-row" style={{ gap: '0.5rem', marginBottom: '0.9rem' }}>
              <div style={{ flex: 1 }}>
                <div className="inspector-label" style={{ marginBottom: '0.25rem' }}>Shadow Y</div>
                <input
                  type="number"
                  min={-40}
                  max={40}
                  value={selectedClip.textData.shadowOffsetY ?? 3}
                  onChange={event => updateClipText(selectedClip.id, { shadowOffsetY: Number(event.target.value) })}
                  style={{ width: '100%', padding: '0.35rem', background: 'var(--surface-3)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
              <div style={{ flex: 1 }} />
            </div>
          </div>
        )}

        {displayedTab === 'assist' && (
          <div className="inspector-section">
            <div className="inspector-section-title">Transcript Assist</div>
            <div className="assist-actions">
              <button
                className="btn-secondary"
                disabled={transcriptInsights.length === 0}
                onClick={() => {
                  addMarkers(transcriptInsightsToMarkers(transcriptInsights));
                  setAssistStatus(transcriptInsights.length > 0
                    ? `Added ${transcriptInsights.length} review marker${transcriptInsights.length === 1 ? '' : 's'}.`
                    : 'No transcript findings to mark.');
                }}
              >
                Add Review Markers
              </button>
              <button
                className="btn-secondary"
                disabled={!selectedClip || captions.length === 0}
                onClick={() => {
                  const count = splitSelectedClipAtCaptionBoundaries();
                  setAssistStatus(count > 0
                    ? `Split selected clip at ${count} caption boundar${count === 1 ? 'y' : 'ies'}.`
                    : 'No caption boundaries fall inside the selected clip.');
                }}
              >
                Split At Captions
              </button>
              <button
                className="btn-secondary"
                disabled={!selectedClip || captions.length === 0}
                onClick={() => {
                  const count = buildTranscriptRoughCut();
                  setAssistStatus(count > 0
                    ? `Built a rough cut with ${count} speech segment${count === 1 ? '' : 's'}.`
                    : 'No usable transcript ranges found for the selected clip.');
                }}
              >
                Build Rough Cut
              </button>
              <button
                className="btn-secondary"
                disabled={!selectedClip || captions.length === 0}
                onClick={() => {
                  const aligned = alignSelectedClipSpeechToPlayhead();
                  setAssistStatus(aligned
                    ? 'Aligned the selected clip so its first spoken word lands on the playhead.'
                    : 'No spoken caption is available to align.');
                }}
              >
                Align First Word
              </button>
            </div>
            {assistStatus && <div className="inspector-helper-text">{assistStatus}</div>}

            {transcriptInsights.length === 0 ? (
              <div className="inspector-tab-empty">Generate a transcript to review filler words, silence gaps, and hook risks.</div>
            ) : (
              <div className="assist-insight-list">
                {transcriptInsights.map(insight => (
                  <div key={insight.id} className={`assist-insight kind-${insight.kind}`}>
                    <div>
                      <strong>{insight.title}</strong>
                      <span>{formatDuration(insight.time)}</span>
                    </div>
                    <p>{insight.detail}</p>
                    <button className="btn-secondary" onClick={() => setPlayheadTime(insight.time)}>
                      Jump
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="inspector-section-title" style={{ marginTop: '1rem' }}>B-roll Suggestions</div>
            <div className="assist-actions">
              <button
                className="btn-secondary"
                disabled={brollSuggestions.length === 0}
                onClick={() => {
                  addMarkers(transcriptInsightsToMarkers(brollSuggestions));
                  setAssistStatus(brollSuggestions.length > 0
                    ? `Added ${brollSuggestions.length} B-roll marker${brollSuggestions.length === 1 ? '' : 's'}.`
                    : 'No B-roll suggestions found.');
                }}
              >
                Add B-roll Markers
              </button>
            </div>
            {brollSuggestions.length === 0 ? (
              <div className="inspector-tab-empty">Longer spoken beats will surface B-roll suggestions here.</div>
            ) : (
              <div className="assist-insight-list">
                {brollSuggestions.slice(0, 4).map(insight => (
                  <div key={insight.id} className={`assist-insight kind-${insight.kind}`}>
                    <div>
                      <strong>{insight.title}</strong>
                      <span>{formatDuration(insight.time)}</span>
                    </div>
                    <p>{insight.detail}</p>
                    <button className="btn-secondary" onClick={() => setPlayheadTime(insight.time)}>
                      Jump
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="inspector-section-title" style={{ marginTop: '1rem' }}>Short-form Variants</div>
            <div className="assist-actions">
              <button
                className="btn-secondary"
                disabled={!selectedClip || shortCandidates.length === 0}
                onClick={() => {
                  const count = appendBestShortDraft(45);
                  setAssistStatus(count > 0
                    ? 'Appended the strongest 45-second short candidate and switched export to 9:16.'
                    : 'No short candidate could be built from the transcript.');
                }}
              >
                Append Best Short
              </button>
              <button className="btn-secondary" onClick={() => setExportSettings({ aspectRatio: '9:16' })}>
                9:16
              </button>
              <button className="btn-secondary" onClick={() => setExportSettings({ aspectRatio: '1:1' })}>
                1:1
              </button>
              <button className="btn-secondary" onClick={() => setExportSettings({ aspectRatio: '16:9' })}>
                16:9
              </button>
            </div>
            {shortCandidates.length > 0 && (
              <div className="assist-insight-list">
                {shortCandidates.slice(0, 3).map(candidate => (
                  <div key={candidate.id} className="assist-insight kind-hook">
                    <div>
                      <strong>{candidate.title || 'Short candidate'}</strong>
                      <span>{candidate.duration.toFixed(1)}s</span>
                    </div>
                    <p>{candidate.hook}</p>
                    <button className="btn-secondary" onClick={() => setPlayheadTime(candidate.start)}>
                      Jump
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Transcript and Export Section */}
        {displayedTab === 'captions' && (
        <div style={{ marginTop: 'auto', paddingTop: '0.25rem' }}>
          <div className="inspector-section-title">Transcript</div>
          {exportStatus && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textAlign: 'center' }}>
              {exportStatus}
            </div>
          )}
          <button
            className="btn-secondary"
            style={{ width: '100%', padding: '0.55rem', marginBottom: '0.5rem' }}
            onClick={transcribeSelectedMedia}
            disabled={isProcessing || !hasTranscriptSource}
            title={hasTranscriptSource ? 'Generate transcript from selected or first audio/video clip' : 'Add an audio or video clip first'}
          >
            {isProcessing ? 'Processing...' : transcriptLanguage === 'si' ? 'Generate Sinhala Transcript' : 'Generate Transcript'}
          </button>
          <label style={{ display: 'grid', gap: '0.35rem', marginBottom: '0.5rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            Transcript language
            <select
              value={transcriptLanguage}
              onChange={event => setTranscriptLanguage(event.target.value as typeof transcriptLanguage)}
              disabled={isProcessing}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}
            >
              <option value="auto">Auto detect</option>
              <option value="si">Sinhala</option>
              <option value="en">English</option>
            </select>
          </label>
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
          <div className="inspector-section-title" style={{ marginTop: '0.9rem' }}>Export</div>
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
              Cancel
            </button>
          )}
        </div>
        )}

        {/* Captions Section */}
        {displayedTab === 'captions' && captions.length > 0 && (
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

        {displayedTab !== 'basic' && (
          <>
            {displayedTab === 'animation' && !selectedClip && (
              <div className="inspector-tab-empty">Select a clip to edit animation.</div>
            )}
            {displayedTab === 'audio' && !selectedClip && (
              <div className="inspector-tab-empty">Select a clip to edit audio.</div>
            )}
            {displayedTab === 'color' && selectedClip?.type !== 'visual' && (
              <div className="inspector-tab-empty">Select a visual clip to adjust color.</div>
            )}
            {displayedTab === 'assist' && captions.length === 0 && (
              <div className="inspector-tab-empty">Generate a transcript to unlock assist tools.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
