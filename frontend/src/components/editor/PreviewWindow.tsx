import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { TimelineClip } from '../../types';
import { getKeyframedValue } from '../../lib/utils/keyframes';
import { CanvasOverlay } from '../../features/canvas/CanvasOverlay';
import { StatusState } from '../ui/StatusState';

const formatTimecode = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30); // 30fps frame count
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
};

const applyFadeCurve = (progress: number, curve: NonNullable<TimelineClip['audio']>['fadeInCurve'] = 'linear') => {
  const safeProgress = Math.max(0, Math.min(1, progress));
  switch (curve) {
    case 'ease_in':
      return safeProgress ** 2;
    case 'ease_out':
      return 1 - ((1 - safeProgress) ** 2);
    case 'smooth':
      return safeProgress * safeProgress * (3 - 2 * safeProgress);
    case 'linear':
    default:
      return safeProgress;
  }
};

export const PreviewWindow = () => {
  const {
    clips,
    tracks,
    selectedClipId,
    playheadTime,
    setPlayheadTime,
    isPlaying,
    isProcessing,
    exportStatus,
    srtContent,
    mediaUrl,
    togglePlayback,
    setIsPlaying,
    updateClipPosition,
    updateClipTransform,
  } = useEditorStore();
  
  const animationRef = useRef<number | null>(null);
  const previewContentRef = useRef<HTMLDivElement>(null);
  const lastUpdateRef = useRef<number>(0);
  const audioRefs = useRef<{ [id: string]: HTMLAudioElement }>({});
  const videoRefs = useRef<{ [id: string]: HTMLVideoElement }>({});
  const pendingPlays = useRef<{ [id: string]: boolean }>({});
  const [showGrid, setShowGrid] = useState(false);
  const [showRulers, setShowRulers] = useState(false);
  const [showSafeArea, setShowSafeArea] = useState(true);
  
  // Memoize object URLs to prevent continuous reloading
  const objectUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const currentIds = new Set(clips.map(c => c.id));
    Object.keys(objectUrlsRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(objectUrlsRef.current[id]);
        delete objectUrlsRef.current[id];
      }
    });
  }, [clips]);

  const getObjectURL = (clip: TimelineClip) => {
    if (!objectUrlsRef.current[clip.id]) {
      objectUrlsRef.current[clip.id] = URL.createObjectURL(clip.file);
    }
    return objectUrlsRef.current[clip.id];
  };

  const buildCssFilter = (clip: TimelineClip): string => {
    const c = clip.color ?? { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0 };
    const effects = clip.effects;
    if (!clip.color && !effects) return '';
    // brightness & contrast: CSS expects % (100% = normal)
    // saturation: CSS expects % (100% = normal)
    // exposure: treat as brightness offset (-100..100 mapped to 0..2)
    const exposureMult = 1 + (c.exposure / 100);
    const brightnessVal = ((c.brightness / 100) * exposureMult);
    // temperature: hue-rotate trick — warm (+) shifts hue slightly positive, cool (-) negative
    const hueShift = c.temperature * 0.3; // subtle: ±30deg at extremes
    const clarityBoost = 1 + ((effects?.clarity ?? 0) / 200);
    const filters = [
      `brightness(${brightnessVal.toFixed(3)})`,
      `contrast(${((c.contrast / 100) * clarityBoost).toFixed(3)})`,
      `saturate(${(c.saturation / 100).toFixed(3)})`,
      `hue-rotate(${hueShift.toFixed(1)}deg)`,
    ];
    if ((effects?.blur ?? 0) > 0) filters.push(`blur(${effects!.blur}px)`);
    if ((effects?.sharpen ?? 0) > 0) {
      filters.push(`contrast(${(1 + effects!.sharpen / 250).toFixed(3)})`);
    }
    return filters.join(' ');
  };

  const isTrackActive = (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track || track.muted || track.visible === false) return false;
    const hasSoloForType = tracks.some(t => t.type === track.type && t.solo);
    return !hasSoloForType || Boolean(track.solo);
  };

  const trackOrderById = new Map(tracks.map((track, index) => [track.id, track.order ?? index]));
  const activeVisualClips = clips
    .filter(c => c.type === 'visual' && isTrackActive(c.trackId) && playheadTime >= c.startTime && playheadTime <= c.startTime + c.duration)
    .sort((a, b) => {
      const trackDelta = (trackOrderById.get(a.trackId) ?? 0) - (trackOrderById.get(b.trackId) ?? 0);
      if (trackDelta !== 0) return trackDelta;
      return (a.animation?.order ?? 0) - (b.animation?.order ?? 0);
    });
  const hasActiveVisuals = activeVisualClips.length > 0;
  const getVisualStyle = (clip: TimelineClip) => {
    const scale = getKeyframedValue(clip, 'scale', playheadTime, clip.transform?.scale ?? 100);
    const rotation = getKeyframedValue(clip, 'rotation', playheadTime, clip.transform?.rotation ?? 0);
    const opacity = getKeyframedValue(clip, 'opacity', playheadTime, clip.transform?.opacity ?? 100);
    const x = getKeyframedValue(clip, 'x', playheadTime, clip.transform?.x ?? clip.animation?.x ?? 50);
    const y = getKeyframedValue(clip, 'y', playheadTime, clip.transform?.y ?? clip.animation?.y ?? 50);
    return {
      left: `${x}%`,
      top: `${y}%`,
      transform: `translate(-50%, -50%) scale(${scale / 100}) rotate(${rotation}deg) scaleX(${clip.transform?.flipX ? -1 : 1}) scaleY(${clip.transform?.flipY ? -1 : 1})`,
      opacity: Math.max(0, Math.min(1, opacity / 100)),
      clipPath: clip.crop
        ? `inset(${clip.crop.top}% ${clip.crop.right}% ${clip.crop.bottom}% ${clip.crop.left}%)`
        : undefined,
      mixBlendMode: clip.compositing?.blendMode === 'normal' ? undefined : clip.compositing?.blendMode,
      border: clip.compositing?.borderWidth
        ? `${clip.compositing.borderWidth}px solid ${clip.compositing.borderColor}`
        : undefined,
      borderRadius: clip.compositing?.maskShape === 'circle'
        ? '50%'
        : clip.compositing?.maskShape === 'rounded'
          ? `${clip.compositing.cornerRadius}px`
          : clip.compositing?.borderWidth
            ? '4px'
            : undefined,
    };
  };
  const getVisualZIndex = (clip: TimelineClip): number => Math.max(1, activeVisualClips.findIndex(item => item.id === clip.id) + 1);
  const selectedClip = clips.find(clip => clip.id === selectedClipId) ?? null;
  const canEditSelectedClip = Boolean(
    selectedClip
    && (selectedClip.type === 'visual' || selectedClip.type === 'text')
    && playheadTime >= selectedClip.startTime
    && playheadTime <= selectedClip.startTime + selectedClip.duration
    && isTrackActive(selectedClip.trackId)
  );

  const maxTime = clips.reduce((max, clip) => {
    const end = clip.startTime + clip.duration;
    if (isNaN(end) || !isFinite(end)) return max;
    return Math.max(max, end);
  }, 0);

  const getMediaTime = (clip: TimelineClip, timelineTime: number): number => {
    const relative = Math.max(0, timelineTime - clip.startTime);
    const rate = clip.speed?.rate ?? 1;
    if (clip.speed?.freezeFrame) return clip.mediaOffset || 0;
    if (clip.speed?.reverse) {
      return Math.max(0, (clip.mediaOffset || 0) + Math.max(0, clip.duration - relative) * rate);
    }
    return (clip.mediaOffset || 0) + relative * rate;
  };

  // Playback Loop
  useEffect(() => {
    if (isPlaying) {
      lastUpdateRef.current = performance.now();
      
      const updatePlayhead = (time: number) => {
        const deltaSec = (time - lastUpdateRef.current) / 1000;
        lastUpdateRef.current = time;
        
        const currentPlayhead = useEditorStore.getState().playheadTime + deltaSec;

        // Stop at end of timeline
        if (maxTime > 0 && currentPlayhead >= maxTime) {
          setPlayheadTime(maxTime);
          setIsPlaying(false);
          return;
        }

        setPlayheadTime(currentPlayhead);
        
        clips.forEach(clip => {
          const mediaEl = clip.type === 'audio' ? audioRefs.current[clip.id] : videoRefs.current[clip.id];
          if (mediaEl) {
            // Mute flag
            const isMuted = (clip.audio?.mute ?? false) || !isTrackActive(clip.trackId);
            if (mediaEl.muted !== isMuted) mediaEl.muted = isMuted;

            const isWithinClip = currentPlayhead >= clip.startTime && currentPlayhead <= clip.startTime + clip.duration;
            if (isWithinClip) {
              const expectedTime = getMediaTime(clip, currentPlayhead);
              const speedRate = clip.speed?.rate ?? 1;
              if (!clip.speed?.reverse && !clip.speed?.freezeFrame && mediaEl.playbackRate !== speedRate) {
                mediaEl.playbackRate = speedRate;
              }
              // --- Volume Envelope ---
              const baseVol = getKeyframedValue(clip, 'volume', currentPlayhead, clip.audio?.volume ?? 100) / 100;
              const relTime = currentPlayhead - clip.startTime; // position within clip
              const fadeIn = clip.audio?.fadeIn ?? 0;
              const fadeOut = clip.audio?.fadeOut ?? 0;
              const clipDur = clip.duration;

              let envMultiplier = 1.0;
              if (fadeIn > 0 && relTime < fadeIn) {
                // Ramp up: 0 → 1 over fadeIn seconds
                envMultiplier = Math.min(1, applyFadeCurve(relTime / fadeIn, clip.audio?.fadeInCurve));
              }
              if (fadeOut > 0 && relTime > clipDur - fadeOut) {
                // Ramp down: 1 → 0 over fadeOut seconds
                const fadeOutProgress = (clipDur - relTime) / fadeOut;
                envMultiplier = Math.min(
                  envMultiplier,
                  Math.max(0, applyFadeCurve(fadeOutProgress, clip.audio?.fadeOutCurve)),
                );
              }
              const targetVol = Math.max(0, Math.min(1, baseVol * envMultiplier));
              if (Math.abs(mediaEl.volume - targetVol) > 0.005) mediaEl.volume = targetVol;

              if (clip.speed?.reverse || clip.speed?.freezeFrame) {
                if (!mediaEl.paused) mediaEl.pause();
                if (Math.abs(mediaEl.currentTime - expectedTime) > 0.5) {
                  mediaEl.currentTime = expectedTime;
                }
              } else if (mediaEl.paused && !mediaEl.ended && !pendingPlays.current[clip.id]) {
                if (Math.abs(mediaEl.currentTime - expectedTime) > 0.5) {
                  mediaEl.currentTime = expectedTime;
                }
                pendingPlays.current[clip.id] = true;
                mediaEl.play()
                  .then(() => { pendingPlays.current[clip.id] = false; })
                  .catch(() => { pendingPlays.current[clip.id] = false; });
              }
            } else {
              if (!mediaEl.paused) mediaEl.pause();
              // Reset volume to base when outside clip so it's correct when it plays next
              const baseVol = (clip.audio?.volume ?? 100) / 100;
              if (mediaEl.volume !== baseVol) mediaEl.volume = Math.max(0, Math.min(1, baseVol));
            }
          }
        });
        
        animationRef.current = requestAnimationFrame(updatePlayhead);
      };
      
      animationRef.current = requestAnimationFrame(updatePlayhead);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      Object.values(audioRefs.current).forEach(a => { if (a && !a.paused) a.pause(); });
      Object.values(videoRefs.current).forEach(v => { if (v && !v.paused) v.pause(); });
    }
    
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, clips, tracks, setPlayheadTime, setIsPlaying, maxTime]);

  // Scrubbing when Paused
  useEffect(() => {
    if (!isPlaying) {
      clips.forEach(clip => {
        const mediaEl = clip.type === 'audio' ? audioRefs.current[clip.id] : videoRefs.current[clip.id];
        if (mediaEl) {
          if (playheadTime >= clip.startTime && playheadTime <= clip.startTime + clip.duration) {
             mediaEl.currentTime = getMediaTime(clip, playheadTime);
          }
        }
      });
    }
  }, [playheadTime, isPlaying, clips]);

  const handleSkipBack = () => setPlayheadTime(0);
  const handleSkipForward = () => { if (maxTime > 0) setPlayheadTime(maxTime); };

  return (
    <div className="preview-window">
      <div className="panel-header">Live Preview</div>
      <div ref={previewContentRef} className="preview-content">
        {isProcessing ? (
          <StatusState title={exportStatus || 'Processing...'} tone="loading" />
        ) : (
          <>
            {/* Render all videos visibly but toggle display so they are controlled by the central sync loop */}
            {activeVisualClips.filter(c => !c.file.type.startsWith('image')).map(clip => (
              <video 
                key={`video-${clip.id}`} 
                ref={el => { if (el) videoRefs.current[clip.id] = el; }} 
                src={getObjectURL(clip)} 
                preload="auto"
                style={{ 
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  maxWidth: '100%', 
                  maxHeight: '100%',
                  objectFit: 'contain',
                  zIndex: getVisualZIndex(clip),
                  ...getVisualStyle(clip),
                  filter: buildCssFilter(clip),
                  transition: 'transform 0.1s ease-out, filter 0.1s ease-out, opacity 0.1s ease-out'
                }} 
              />
            ))}

            {/* Images */}
            {activeVisualClips.filter(c => c.file.type.startsWith('image')).map(clip => (
              <img
                key={`image-${clip.id}`}
                src={getObjectURL(clip)}
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  zIndex: getVisualZIndex(clip),
                  ...getVisualStyle(clip),
                  filter: buildCssFilter(clip),
                  transition: 'transform 0.1s ease-out, filter 0.1s ease-out, opacity 0.1s ease-out'
                }} 
              />
            ))}

            {activeVisualClips
              .filter(clip => (clip.effects?.vignette ?? 0) > 0)
              .map(clip => (
                <div
                  key={`vignette-${clip.id}`}
                  className="preview-vignette-overlay"
                  style={{
                    ...getVisualStyle(clip),
                    zIndex: getVisualZIndex(clip) + 0.25,
                    opacity: Math.max(0, Math.min(0.92, (clip.effects?.vignette ?? 0) / 100)),
                  }}
                />
              ))}

            {activeVisualClips
              .filter(clip => clip.effects?.overlayPreset && clip.effects.overlayPreset !== 'none')
              .map(clip => (
                <div
                  key={`overlay-${clip.id}`}
                  className={`preview-effect-overlay preset-${clip.effects?.overlayPreset}`}
                  style={{
                    ...getVisualStyle(clip),
                    zIndex: getVisualZIndex(clip) + 0.35,
                    opacity: Math.max(0, Math.min(1, (clip.effects?.overlayIntensity ?? 0) / 100)),
                  }}
                />
              ))}

            {/* Text Overlays */}
            {clips
              .filter(c => c.type === 'text' && isTrackActive(c.trackId) && c.textData && playheadTime >= c.startTime && playheadTime <= c.startTime + c.duration)
              .map(clip => {
                const td = clip.textData!;
                const scale = getKeyframedValue(clip, 'scale', playheadTime, clip.transform?.scale ?? 100);
                const rotation = getKeyframedValue(clip, 'rotation', playheadTime, clip.transform?.rotation ?? 0);
                const x = getKeyframedValue(clip, 'x', playheadTime, td.x);
                const y = getKeyframedValue(clip, 'y', playheadTime, td.y);
                const shadowColor = td.shadowColor ?? '#000000';
                const shadowOpacity = td.shadowOpacity ?? 0.6;
                const shadowHex = Math.round(Math.max(0, Math.min(1, shadowOpacity)) * 255).toString(16).padStart(2, '0');
                const words = td.content.trim().split(/\s+/).filter(Boolean);
                const clipProgress = Math.max(0, Math.min(1, (playheadTime - clip.startTime) / Math.max(clip.duration, 0.001)));
                const highlightedWords = Math.max(1, Math.ceil(words.length * clipProgress));
                return (
                  <div
                    key={clip.id}
                    style={{
                      position: 'absolute',
                      left: `${x}%`,
                      top: `${y}%`,
                      transform: `translate(-50%, -50%) scale(${scale / 100}) rotate(${rotation}deg)`,
                      fontFamily: td.fontFamily,
                      fontSize: `${td.fontSize}px`,
                      color: td.color,
                      fontWeight: td.bold ? 700 : 400,
                      fontStyle: td.italic ? 'italic' : 'normal',
                      textAlign: td.align,
                      backgroundColor: td.bgOpacity > 0
                        ? `${td.bgColor}${Math.round(td.bgOpacity * 255).toString(16).padStart(2, '0')}`
                        : 'transparent',
                      padding: td.bgOpacity > 0 ? `${td.boxPadding ?? 14}px` : '0',
                      borderRadius: td.bgOpacity > 0 ? `${td.boxRadius ?? 10}px` : '0',
                      opacity: getKeyframedValue(clip, 'opacity', playheadTime, clip.transform?.opacity ?? 100) / 100,
                      whiteSpace: 'pre-wrap',
                      maxWidth: `${td.maxWidthPercent ?? 82}%`,
                      pointerEvents: 'none',
                      textShadow: shadowOpacity > 0
                        ? `${td.shadowOffsetX ?? 0}px ${td.shadowOffsetY ?? 3}px ${td.shadowBlur ?? 6}px ${shadowColor}${shadowHex}`
                        : 'none',
                      WebkitTextStroke: `${td.strokeWidth ?? 0}px ${td.strokeColor ?? '#000000'}`,
                      zIndex: 100 + (clip.animation?.order ?? 0),
                    }}
                  >
                    {td.captionMode === 'karaoke' && words.length > 0
                      ? words.map((word, index) => (
                          <span
                            key={`${clip.id}-word-${index}`}
                            className={index < highlightedWords ? 'karaoke-word active' : 'karaoke-word'}
                            style={index < highlightedWords ? { color: td.highlightColor ?? '#f7d26a' } : undefined}
                          >
                            {word}{index < words.length - 1 ? ' ' : ''}
                          </span>
                        ))
                      : td.content}
                  </div>
                );
              })
            }

            {canEditSelectedClip && selectedClip && (
              <CanvasOverlay
                clip={selectedClip}
                playheadTime={playheadTime}
                containerRef={previewContentRef}
                showGrid={showGrid}
                showRulers={showRulers}
                showSafeArea={showSafeArea}
                onToggleGrid={() => setShowGrid(current => !current)}
                onToggleRulers={() => setShowRulers(current => !current)}
                onToggleSafeArea={() => setShowSafeArea(current => !current)}
                onMove={(x, y) => updateClipPosition(selectedClip.id, x, y)}
                onScale={(scale) => updateClipTransform(selectedClip.id, { scale })}
                onCrop={(updates) => useEditorStore.getState().updateClipCrop(selectedClip.id, updates)}
                onReset={() => {
                  updateClipPosition(selectedClip.id, 50, selectedClip.type === 'text' ? selectedClip.textData?.y ?? 85 : 50);
                  updateClipTransform(selectedClip.id, { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false });
                  useEditorStore.getState().updateClipCrop(selectedClip.id, { left: 0, right: 0, top: 0, bottom: 0 });
                }}
              />
            )}

            {/* If no visuals but exported media exists */}
            {!hasActiveVisuals && srtContent && mediaUrl && (
              <div className="audio-player-container" style={{ display: 'flex', justifyContent: 'center' }}>
                {mediaUrl.endsWith('.mp4') ? (
                  <video controls src={mediaUrl} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '4px' }} />
                ) : (
                  <audio controls src={mediaUrl} style={{ width: '100%' }} />
                )}
              </div>
            )}

            {/* No Visuals Placeholder */}
            {!hasActiveVisuals && !srtContent && (
              <StatusState
                title="No visuals at current time"
                body="Move the playhead or add a clip to the timeline."
                icon={
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: 'var(--text-secondary)', opacity: 0.4 }}>
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                    <line x1="7" y1="2" x2="7" y2="22"></line>
                    <line x1="17" y1="2" x2="17" y2="22"></line>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                  </svg>
                }
              />
            )}

            {/* Subtitles Preview */}
            {srtContent && !hasActiveVisuals && (
              <div className="srt-preview">{srtContent}</div>
            )}
          </>
        )}

        {/* Hidden audio tags */}
        <div style={{ display: 'none' }}>
          {clips.filter(c => c.type === 'audio').map(clip => (
            <audio key={`audio-${clip.id}`} ref={el => { if (el) audioRefs.current[clip.id] = el; }} src={getObjectURL(clip)} preload="auto" />
          ))}
        </div>
      </div>

      {/* Transport Controls Bar */}
      <div className="preview-transport">
        <div className="transport-timecode">{formatTimecode(playheadTime)}</div>
        <div className="transport-controls">
          <button className="btn-icon transport-btn" onClick={handleSkipBack} title="Go to Start">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="19 20 9 12 19 4 19 20"></polygon>
              <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2"></line>
            </svg>
          </button>
          <button className="btn-primary transport-play" onClick={togglePlayback} title={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            )}
          </button>
          <button className="btn-icon transport-btn" onClick={handleSkipForward} title="Go to End">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 4 15 12 5 20 5 4"></polygon>
              <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2"></line>
            </svg>
          </button>
        </div>
        <div className="transport-duration">{formatTimecode(maxTime)}</div>
      </div>
    </div>
  );
};
