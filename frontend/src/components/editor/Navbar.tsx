import { useEffect } from 'react';
import { Download, Film, FolderOpen, Save, Sparkles, UsersRound, Workflow } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { useContentProfileStore } from '../../features/contentProfiles/contentProfileStore';
import { PLATFORM_OPTIONS } from '../../features/contentProfiles/types';
import { Button } from '../ui/Button';

type NavbarProps = {
  onOpenBridgeMonitor?: () => void;
  onOpenContentProfiles?: () => void;
};

export const Navbar = ({ onOpenBridgeMonitor, onOpenContentProfiles }: NavbarProps) => {
  const {
    clips,
    isProcessing,
    openExportModal,
    mediaUrl,
    assets,
    currentProject,
    projectName,
    projectContentProfileId,
    projectTargetPlatform,
    projectStatus,
    lastSavedAt,
    isSavingProject,
    missingMedia,
    setProjectName,
    setProjectContentProfileId,
    setProjectTargetPlatform,
    newProject,
    saveProject,
  } = useEditorStore();
  const { profiles, loadProfiles } = useContentProfileStore();
  const visualAsset = assets.find(a => a.type === 'visual');
  const exportedAudioOnly = mediaUrl?.endsWith('.mp3');
  const exportedMov = mediaUrl?.endsWith('.mov');
  const savedLabel = lastSavedAt
    ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'Ready';

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  return (
    <header className="navbar topbar">
      <div className="topbar-brand">
        <span className="brand-mark">
          <Film size={18} strokeWidth={2.2} />
        </span>
        <div>
          <strong>NeuralScribe</strong>
          <span>Editor</span>
        </div>
      </div>
      <div className="topbar-project">
        <div className="topbar-project-main">
          <input
            className="project-name-input"
            value={projectName}
            onChange={event => setProjectName(event.target.value)}
            aria-label="Project name"
          />
          <select
            className="project-meta-select"
            value={projectContentProfileId ?? ''}
            onChange={event => setProjectContentProfileId(event.target.value || null)}
            aria-label="Content profile"
          >
            <option value="">No profile</option>
            {profiles.map(profile => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
          <select
            className="project-meta-select"
            value={projectTargetPlatform ?? ''}
            onChange={event => setProjectTargetPlatform((event.target.value || null) as typeof projectTargetPlatform)}
            aria-label="Target platform"
          >
            <option value="">No platform</option>
            {PLATFORM_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="topbar-project-meta">
          <span className={`save-pill ${isSavingProject ? 'saving' : ''}`}>
            <Save size={12} />
            {isSavingProject ? 'Saving' : savedLabel}
          </span>
          {missingMedia.length > 0 && (
            <span className="save-pill warning">{missingMedia.length} missing media</span>
          )}
          <span
            className="project-folder"
            title={currentProject?.generatedMediaPath || projectStatus || 'Save the project to create a media folder'}
          >
            <FolderOpen size={12} />
            {currentProject ? currentProject.generatedMediaPath : 'No project folder yet'}
          </span>
        </div>
      </div>
      <div className="nav-actions topbar-actions">
        <Button variant="ghost" leadingIcon={<Sparkles size={15} />} onClick={() => window.open('/#content-studio', '_blank', 'noopener,noreferrer')}>
          Studio
        </Button>
        <Button variant="ghost" leadingIcon={<UsersRound size={15} />} onClick={onOpenContentProfiles}>
          Profiles
        </Button>
        <Button variant="ghost" leadingIcon={<Workflow size={15} />} onClick={onOpenBridgeMonitor}>
          Bridge
        </Button>
        {mediaUrl && (
          <a href={mediaUrl} download={exportedAudioOnly || !visualAsset ? "export.mp3" : exportedMov ? "export.mov" : "export.mp4"} className="ui-button ui-button-ghost topbar-link-button">
            <Download size={15} />
            {exportedAudioOnly || !visualAsset ? "Audio" : "Video"}
          </a>
        )}
        <Button
          variant="primary"
          onClick={openExportModal} 
          disabled={clips.length === 0 || isProcessing}
        >
          {isProcessing ? 'Processing...' : 'Export & Transcribe'}
        </Button>
        <Button variant="secondary" onClick={() => void saveProject()} disabled={isSavingProject}>
          Save
        </Button>
        <Button variant="secondary" onClick={newProject}>
          New
        </Button>
      </div>
    </header>
  );
};
