import { useEditorStore } from '../../store/editorStore';

export const Navbar = () => {
  const { clips, isProcessing, exportSequence, mediaUrl, assets } = useEditorStore();
  const visualAsset = assets.find(a => a.type === 'visual');

  return (
    <div className="navbar">
      <div className="brand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
          <line x1="7" y1="2" x2="7" y2="22"></line>
          <line x1="17" y1="2" x2="17" y2="22"></line>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <line x1="2" y1="7" x2="7" y2="7"></line>
          <line x1="2" y1="17" x2="7" y2="17"></line>
          <line x1="17" y1="17" x2="22" y2="17"></line>
          <line x1="17" y1="7" x2="22" y2="7"></line>
        </svg>
        NeuralScribe Video Editor
      </div>
      <div className="nav-actions">
        {mediaUrl && (
          <a href={mediaUrl} download={visualAsset ? "export.mp4" : "export.mp3"} className="btn-secondary" style={{textDecoration: 'none'}}>
            Download {visualAsset ? "Video" : "Audio"}
          </a>
        )}
        <button 
          className="btn-primary" 
          onClick={exportSequence} 
          disabled={clips.filter(c => c.type === 'audio').length === 0 || isProcessing}
        >
          {isProcessing ? 'Processing...' : 'Export & Transcribe'}
        </button>
      </div>
    </div>
  );
};
