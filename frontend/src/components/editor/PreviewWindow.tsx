import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editorStore';

export const PreviewWindow = () => {
  const { clips, playheadTime, setPlayheadTime, isPlaying, isProcessing, srtContent, mediaUrl } = useEditorStore();
  
  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const audioRefs = useRef<{ [id: string]: HTMLAudioElement }>({});
  const videoRefs = useRef<{ [id: string]: HTMLVideoElement }>({});

  const activeVisualClip = clips.find(c => c.type === 'visual' && playheadTime >= c.startTime && playheadTime <= c.startTime + c.duration);

  useEffect(() => {
    if (isPlaying) {
      lastUpdateRef.current = performance.now();
      
      const updatePlayhead = (time: number) => {
        const deltaSec = (time - lastUpdateRef.current) / 1000;
        lastUpdateRef.current = time;
        
        setPlayheadTime(useEditorStore.getState().playheadTime + deltaSec);
        const currentPlayhead = useEditorStore.getState().playheadTime;
        
        // Sync HTML Media Elements
        clips.forEach(clip => {
          const mediaEl = clip.type === 'audio' ? audioRefs.current[clip.id] : videoRefs.current[clip.id];
          if (mediaEl) {
            const isWithinClip = currentPlayhead >= clip.startTime && currentPlayhead <= clip.startTime + clip.duration;
            if (isWithinClip) {
              if (mediaEl.paused && !mediaEl.ended) {
                const expectedTime = currentPlayhead - clip.startTime;
                if (Math.abs(mediaEl.currentTime - expectedTime) > 0.5) {
                  mediaEl.currentTime = expectedTime;
                }
                mediaEl.play().catch(e => console.error("Playback error:", e));
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

  return (
    <div className="preview-window">
      {/* Hidden Media Elements for Live Playback */}
      <div style={{ display: 'none' }}>
        {clips.map(clip => {
          const url = URL.createObjectURL(clip.file);
          if (clip.type === 'audio') {
            return <audio key={`audio-${clip.id}`} ref={el => { if (el) audioRefs.current[clip.id] = el; }} src={url} preload="auto" />;
          } else if (clip.type === 'visual' && !clip.file.type.startsWith('image')) {
            return <video key={`video-${clip.id}`} ref={el => { if (el) videoRefs.current[clip.id] = el; }} src={url} preload="auto" />;
          }
          return null;
        })}
      </div>

      <div className="panel-header">Live Preview</div>
      <div className="preview-content">
        {isProcessing ? (
          <div className="status-indicator">
            <div className="spinner"></div>
            <div style={{ color: 'var(--text-secondary)' }}>Processing media & generating subtitles...</div>
          </div>
        ) : activeVisualClip ? (
          activeVisualClip.file.type.startsWith('image') ? (
            <img src={URL.createObjectURL(activeVisualClip.file)} style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px' }} />
          ) : (
            <video 
              src={URL.createObjectURL(activeVisualClip.file)} 
              style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px' }} 
              ref={el => { if (el) { el.currentTime = playheadTime - activeVisualClip.startTime; } }}
            />
          )
        ) : srtContent ? (
          <>
            {mediaUrl && (
              <div className="audio-player-container" style={{ display: 'flex', justifyContent: 'center' }}>
                {mediaUrl.endsWith('.mp4') ? (
                  <video controls src={mediaUrl} style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px' }} />
                ) : (
                  <audio controls src={mediaUrl} style={{ width: '100%' }} />
                )}
              </div>
            )}
            <div className="srt-preview">{srtContent}</div>
          </>
        ) : (
          <div className="audio-visualizer-placeholder" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--text-secondary)' }}>No Visuals at current time</span>
          </div>
        )}
        <div style={{ marginTop: '1rem', color: 'var(--text-highlight)' }}>
          {new Date(playheadTime * 1000).toISOString().substring(11, 19)}
        </div>
      </div>
    </div>
  );
};
