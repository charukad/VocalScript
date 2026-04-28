import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { TimelineClip } from '../../types';

export const PreviewWindow = () => {
  const { clips, playheadTime, setPlayheadTime, isPlaying, isProcessing, srtContent, mediaUrl } = useEditorStore();
  
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

  const activeVisualClip = clips.find(c => c.type === 'visual' && playheadTime >= c.startTime && playheadTime <= c.startTime + c.duration);

  // Playback Loop
  useEffect(() => {
    if (isPlaying) {
      lastUpdateRef.current = performance.now();
      
      const updatePlayhead = (time: number) => {
        const deltaSec = (time - lastUpdateRef.current) / 1000;
        lastUpdateRef.current = time;
        
        const currentPlayhead = useEditorStore.getState().playheadTime + deltaSec;
        setPlayheadTime(currentPlayhead);
        
        clips.forEach(clip => {
          const mediaEl = clip.type === 'audio' ? audioRefs.current[clip.id] : videoRefs.current[clip.id];
          if (mediaEl) {
            const isWithinClip = currentPlayhead >= clip.startTime && currentPlayhead <= clip.startTime + clip.duration;
            if (isWithinClip) {
              if (mediaEl.paused && !mediaEl.ended && !pendingPlays.current[clip.id]) {
                const expectedTime = currentPlayhead - clip.startTime;
                if (Math.abs(mediaEl.currentTime - expectedTime) > 0.5) {
                  mediaEl.currentTime = expectedTime;
                }
                pendingPlays.current[clip.id] = true;
                mediaEl.play()
                  .then(() => { pendingPlays.current[clip.id] = false; })
                  .catch(e => { pendingPlays.current[clip.id] = false; });
              }
            } else {
              if (!mediaEl.paused) mediaEl.pause();
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
  }, [isPlaying, clips, setPlayheadTime]);

  // Scrubbing when Paused
  useEffect(() => {
    if (!isPlaying) {
      clips.forEach(clip => {
        const mediaEl = clip.type === 'audio' ? audioRefs.current[clip.id] : videoRefs.current[clip.id];
        if (mediaEl) {
          if (playheadTime >= clip.startTime && playheadTime <= clip.startTime + clip.duration) {
             mediaEl.currentTime = playheadTime - clip.startTime;
          }
        }
      });
    }
  }, [playheadTime, isPlaying, clips]);

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
                  maxHeight: '400px', 
                  borderRadius: '8px',
                  display: activeVisualClip?.id === clip.id ? 'block' : 'none' 
                }} 
              />
            ))}

            {/* Images */}
            {activeVisualClip?.file.type.startsWith('image') && (
              <img src={getObjectURL(activeVisualClip)} style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px' }} />
            )}

            {/* If no visuals but exported media exists */}
            {!activeVisualClip && srtContent && mediaUrl && (
              <div className="audio-player-container" style={{ display: 'flex', justifyContent: 'center' }}>
                {mediaUrl.endsWith('.mp4') ? (
                  <video controls src={mediaUrl} style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px' }} />
                ) : (
                  <audio controls src={mediaUrl} style={{ width: '100%' }} />
                )}
              </div>
            )}

            {/* No Visuals Placeholder */}
            {!activeVisualClip && !srtContent && (
              <div className="audio-visualizer-placeholder" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>No Visuals at current time</span>
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

        <div style={{ marginTop: '1rem', color: 'var(--text-highlight)' }}>
          {new Date(playheadTime * 1000).toISOString().substring(11, 19)}
        </div>
      </div>
    </div>
  );
};
