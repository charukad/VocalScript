import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { TimelineClip } from '../../types';

const formatTimecode = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30); // 30fps frame count
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
};

export const PreviewWindow = () => {
  const { clips, playheadTime, setPlayheadTime, isPlaying, isProcessing, srtContent, mediaUrl, togglePlayback, setIsPlaying } = useEditorStore();
  
  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const audioRefs = useRef<{ [id: string]: HTMLAudioElement }>({});
  const videoRefs = useRef<{ [id: string]: HTMLVideoElement }>({});
  const pendingPlays = useRef<{ [id: string]: boolean }>({});
  
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
    const c = clip.color;
    if (!c) return '';
    // brightness & contrast: CSS expects % (100% = normal)
    // saturation: CSS expects % (100% = normal)
    // exposure: treat as brightness offset (-100..100 mapped to 0..2)
    const exposureMult = 1 + (c.exposure / 100);
    const brightnessVal = ((c.brightness / 100) * exposureMult);
    // temperature: hue-rotate trick — warm (+) shifts hue slightly positive, cool (-) negative
    const hueShift = c.temperature * 0.3; // subtle: ±30deg at extremes
    return [
      `brightness(${brightnessVal.toFixed(3)})`,
      `contrast(${(c.contrast / 100).toFixed(3)})`,
      `saturate(${(c.saturation / 100).toFixed(3)})`,
      `hue-rotate(${hueShift.toFixed(1)}deg)`,
    ].join(' ');
  };

  const activeVisualClip = clips.find(c => c.type === 'visual' && playheadTime >= c.startTime && playheadTime <= c.startTime + c.duration);

  const maxTime = clips.reduce((max, clip) => {
    const end = clip.startTime + clip.duration;
    if (isNaN(end) || !isFinite(end)) return max;
    return Math.max(max, end);
  }, 0);

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
            const isMuted = clip.audio?.mute ?? false;
            if (mediaEl.muted !== isMuted) mediaEl.muted = isMuted;

            const isWithinClip = currentPlayhead >= clip.startTime && currentPlayhead <= clip.startTime + clip.duration;
            if (isWithinClip) {
              // --- Volume Envelope ---
              const baseVol = (clip.audio?.volume ?? 100) / 100;
              const relTime = currentPlayhead - clip.startTime; // position within clip
              const fadeIn = clip.audio?.fadeIn ?? 0;
              const fadeOut = clip.audio?.fadeOut ?? 0;
              const clipDur = clip.duration;

              let envMultiplier = 1.0;
              if (fadeIn > 0 && relTime < fadeIn) {
                // Ramp up: 0 → 1 over fadeIn seconds
                envMultiplier = Math.min(1, relTime / fadeIn);
              }
              if (fadeOut > 0 && relTime > clipDur - fadeOut) {
                // Ramp down: 1 → 0 over fadeOut seconds
                const fadeOutProgress = (clipDur - relTime) / fadeOut;
                envMultiplier = Math.min(envMultiplier, Math.max(0, fadeOutProgress));
              }
              const targetVol = Math.max(0, Math.min(1, baseVol * envMultiplier));
              if (Math.abs(mediaEl.volume - targetVol) > 0.005) mediaEl.volume = targetVol;

              if (mediaEl.paused && !mediaEl.ended && !pendingPlays.current[clip.id]) {
                const expectedTime = currentPlayhead - clip.startTime + (clip.mediaOffset || 0);
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
  }, [isPlaying, clips, setPlayheadTime, setIsPlaying, maxTime]);

  // Scrubbing when Paused
  useEffect(() => {
    if (!isPlaying) {
      clips.forEach(clip => {
        const mediaEl = clip.type === 'audio' ? audioRefs.current[clip.id] : videoRefs.current[clip.id];
        if (mediaEl) {
          if (playheadTime >= clip.startTime && playheadTime <= clip.startTime + clip.duration) {
             mediaEl.currentTime = playheadTime - clip.startTime + (clip.mediaOffset || 0);
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
      <div className="preview-content">
        {isProcessing ? (
          <div className="status-indicator">
            <div className="spinner"></div>
            <div style={{ color: 'var(--text-secondary)' }}>Processing media & generating subtitles...</div>
          </div>
        ) : (
          <>
            {/* Render all videos visibly but toggle display so they are controlled by the central sync loop */}
            {clips.filter(c => c.type === 'visual' && !c.file.type.startsWith('image')).map(clip => (
              <video 
                key={`video-${clip.id}`} 
                ref={el => { if (el) videoRefs.current[clip.id] = el; }} 
                src={getObjectURL(clip)} 
                preload="auto"
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '100%',
                  objectFit: 'contain',
                  borderRadius: '4px',
                  display: activeVisualClip?.id === clip.id ? 'block' : 'none',
                  transform: activeVisualClip?.id === clip.id ? `scale(${clip.transform?.scale ? clip.transform.scale / 100 : 1}) rotate(${clip.transform?.rotation || 0}deg) scaleX(${clip.transform?.flipX ? -1 : 1}) scaleY(${clip.transform?.flipY ? -1 : 1})` : undefined,
                  filter: activeVisualClip?.id === clip.id ? buildCssFilter(clip) : undefined,
                  transition: 'transform 0.1s ease-out, filter 0.1s ease-out'
                }} 
              />
            ))}

            {/* Images */}
            {activeVisualClip?.file.type.startsWith('image') && (
              <img 
                src={getObjectURL(activeVisualClip)} 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '100%', 
                  objectFit: 'contain', 
                  borderRadius: '4px',
                  transform: `scale(${activeVisualClip.transform?.scale ? activeVisualClip.transform.scale / 100 : 1}) rotate(${activeVisualClip.transform?.rotation || 0}deg) scaleX(${activeVisualClip.transform?.flipX ? -1 : 1}) scaleY(${activeVisualClip.transform?.flipY ? -1 : 1})`,
                  filter: buildCssFilter(activeVisualClip),
                  transition: 'transform 0.1s ease-out, filter 0.1s ease-out'
                }} 
              />
            )}

            {/* Text Overlays */}
            {clips
              .filter(c => c.type === 'text' && c.textData && playheadTime >= c.startTime && playheadTime <= c.startTime + c.duration)
              .map(clip => {
                const td = clip.textData!;
                return (
                  <div
                    key={clip.id}
                    style={{
                      position: 'absolute',
                      left: `${td.x}%`,
                      top: `${td.y}%`,
                      transform: 'translate(-50%, -50%)',
                      fontFamily: td.fontFamily,
                      fontSize: `${td.fontSize}px`,
                      color: td.color,
                      fontWeight: td.bold ? 700 : 400,
                      fontStyle: td.italic ? 'italic' : 'normal',
                      textAlign: td.align,
                      backgroundColor: td.bgOpacity > 0
                        ? `${td.bgColor}${Math.round(td.bgOpacity * 255).toString(16).padStart(2, '0')}`
                        : 'transparent',
                      padding: td.bgOpacity > 0 ? '0.2em 0.4em' : '0',
                      borderRadius: td.bgOpacity > 0 ? '4px' : '0',
                      whiteSpace: 'pre-wrap',
                      maxWidth: '90%',
                      pointerEvents: 'none',
                      textShadow: td.bgOpacity === 0 ? '0 1px 4px rgba(0,0,0,0.8)' : 'none',
                    }}
                  >
                    {td.content}
                  </div>
                );
              })
            }

            {/* If no visuals but exported media exists */}
            {!activeVisualClip && srtContent && mediaUrl && (
              <div className="audio-player-container" style={{ display: 'flex', justifyContent: 'center' }}>
                {mediaUrl.endsWith('.mp4') ? (
                  <video controls src={mediaUrl} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '4px' }} />
                ) : (
                  <audio controls src={mediaUrl} style={{ width: '100%' }} />
                )}
              </div>
            )}

            {/* No Visuals Placeholder */}
            {!activeVisualClip && !srtContent && (
              <div className="no-visual-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: 'var(--text-secondary)', opacity: 0.4 }}>
                  <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                  <line x1="7" y1="2" x2="7" y2="22"></line>
                  <line x1="17" y1="2" x2="17" y2="22"></line>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                </svg>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', opacity: 0.6 }}>No visuals at current time</span>
              </div>
            )}

            {/* Subtitles Preview */}
            {srtContent && !activeVisualClip && (
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
