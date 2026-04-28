import { useState } from 'react';
import { useEditorStore } from '../../store/editorStore';

export const Inspector = () => {
  const { clips, srtContent, srtDownloadUrl } = useEditorStore();
  const [isCopied, setIsCopied] = useState(false);

  const maxTime = clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0);

  const handleCopy = async () => {
    if (srtContent) {
      await navigator.clipboard.writeText(srtContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <div className="panel properties-panel">
      <div className="panel-header">Inspector</div>
      <div className="panel-content">
        <div className="prop-group">
          <span className="prop-label">Timeline Assets</span>
          <span className="prop-value">{clips.length} clips</span>
        </div>
        <div className="prop-group">
          <span className="prop-label">Sequence Duration</span>
          <span className="prop-value">{Math.round(maxTime)} seconds</span>
        </div>
        {srtContent && (
          <div className="prop-group" style={{ marginTop: '2rem' }}>
            <span className="prop-label">Exported Subtitles</span>
            <button className="btn-secondary" onClick={handleCopy} style={{ width: '100%', marginBottom: '0.5rem' }}>
              {isCopied ? 'Copied!' : 'Copy SRT Text'}
            </button>
            {srtDownloadUrl && (
              <a href={srtDownloadUrl} download="subtitles.srt" className="btn-secondary" style={{ width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                Download .SRT
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
