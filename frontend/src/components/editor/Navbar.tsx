import { useEditorStore } from '../../store/editorStore';

type NavbarProps = {
  onOpenBridgeMonitor?: () => void;
};

export const Navbar = ({ onOpenBridgeMonitor }: NavbarProps) => {
  const {
    clips,
    isProcessing,
    openExportModal,
    mediaUrl,
    assets,
    currentProject,
    projectName,
    projectStatus,
    isSavingProject,
    setProjectName,
    newProject,
    saveProject,
  } = useEditorStore();
  const visualAsset = assets.find(a => a.type === 'visual');
  const exportedAudioOnly = mediaUrl?.endsWith('.mp3');

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
      <div className="project-bar">
        <input
          className="project-name-input"
          value={projectName}
          onChange={event => setProjectName(event.target.value)}
          aria-label="Project name"
        />
        <button className="btn-secondary" onClick={() => void saveProject()} disabled={isSavingProject}>
          {isSavingProject ? 'Saving...' : 'Save Project'}
        </button>
        <button className="btn-secondary" onClick={newProject}>
          New
        </button>
        <span
          className="project-folder"
          title={currentProject?.generatedMediaPath || projectStatus || 'Save the project to create a media folder'}
        >
          {currentProject ? currentProject.generatedMediaPath : 'No project folder yet'}
        </span>
      </div>
      <div className="nav-actions">
        <button className="btn-secondary" onClick={onOpenBridgeMonitor}>
          Bridge Monitor
        </button>
        {mediaUrl && (
          <a href={mediaUrl} download={exportedAudioOnly || !visualAsset ? "export.mp3" : "export.mp4"} className="btn-secondary" style={{textDecoration: 'none'}}>
            Download {exportedAudioOnly || !visualAsset ? "Audio" : "Video"}
          </a>
        )}
        <button 
          className="btn-primary" 
          onClick={openExportModal} 
          disabled={clips.length === 0 || isProcessing}
        >
          {isProcessing ? 'Processing...' : 'Export & Transcribe'}
        </button>
      </div>
    </div>
  );
};
