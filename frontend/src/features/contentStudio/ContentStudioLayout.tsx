import { useEffect, useState } from 'react';
import { useContentProfileStore } from '../contentProfiles/contentProfileStore';
import { IdeasTab } from './IdeasTab';
import { ScriptLabTab } from './ScriptLabTab';
import { AgentsTab } from './AgentsTab';
import { VoiceTab } from './VoiceTab';
import { StoryboardTab } from './StoryboardTab';
import { AnalyticsTab } from './AnalyticsTab';
import { useContentStudioStore } from './contentStudioStore';

type StudioTab = 'ideas' | 'script_lab' | 'storyboard' | 'voice' | 'analytics' | 'agents';

const tabs: { id: StudioTab; label: string }[] = [
  { id: 'ideas', label: 'Ideas' },
  { id: 'script_lab', label: 'Script Lab' },
  { id: 'storyboard', label: 'Storyboard' },
  { id: 'voice', label: 'Voice' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'agents', label: 'Agents' },
];

export const ContentStudioLayout = () => {
  const { profiles, selectedProfileId, loadProfiles, selectProfile } = useContentProfileStore();
  const { loadProfileWorkspace, error, isLoading } = useContentStudioStore();
  const [activeTab, setActiveTab] = useState<StudioTab>('ideas');

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    void loadProfileWorkspace(selectedProfileId);
  }, [loadProfileWorkspace, selectedProfileId]);

  return (
    <div className="content-studio-layout">
      <header className="content-studio-header">
        <div className="brand">NeuralScribe Content Studio</div>
        <div className="content-studio-toolbar">
          <select
            value={selectedProfileId ?? ''}
            onChange={event => selectProfile(event.target.value || null)}
            aria-label="Selected content profile"
          >
            <option value="">Select profile</option>
            {profiles.map(profile => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
          <button className="btn-secondary" onClick={() => { window.location.hash = ''; }}>
            Editor
          </button>
        </div>
      </header>

      <nav className="content-studio-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={tab.id === activeTab ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="content-studio-main">
        {!selectedProfileId && (
          <div className="studio-empty studio-empty-large">Create or select a Content Profile to begin.</div>
        )}
        {selectedProfileId && (
          <>
            {error && <div className="content-profile-error">{error}</div>}
            {isLoading && <div className="studio-empty studio-empty-large">Loading studio workspace...</div>}
            {!isLoading && activeTab === 'ideas' && <IdeasTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'script_lab' && <ScriptLabTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'storyboard' && <StoryboardTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'voice' && <VoiceTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'analytics' && <AnalyticsTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'agents' && <AgentsTab profileId={selectedProfileId} />}
          </>
        )}
      </main>
    </div>
  );
};
