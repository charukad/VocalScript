import { useEffect, useState } from 'react';
import { useContentProfileStore } from '../contentProfiles/contentProfileStore';
import { IdeasTab } from './IdeasTab';
import { ScriptLabTab } from './ScriptLabTab';
import { AgentsTab } from './AgentsTab';
import { VoiceTab } from './VoiceTab';
import { StoryboardTab } from './StoryboardTab';
import { AnalyticsTab } from './AnalyticsTab';
import { TrendingTopicsTab } from './TrendingTopicsTab';
import { CompetitorsTab } from './CompetitorsTab';
import { PackagingTab } from './PackagingTab';
import { BrandKitTab } from './BrandKitTab';
import { PromptLibraryTab } from './PromptLibraryTab';
import { CaptionDesignerTab } from './CaptionDesignerTab';
import { ContentCalendarTab } from './ContentCalendarTab';
import { ABTestingTab } from './ABTestingTab';
import { CharacterConsistencyTab } from './CharacterConsistencyTab';
import { CommentsTab } from './CommentsTab';
import { RepurposeTab } from './RepurposeTab';
import { PublishingTab } from './PublishingTab';
import { useContentStudioStore } from './contentStudioStore';

type StudioTab = 'ideas' | 'trending_topics' | 'competitors' | 'brand_kit' | 'characters' | 'caption_designer' | 'prompt_library' | 'content_calendar' | 'ab_testing' | 'script_lab' | 'packaging' | 'repurpose' | 'storyboard' | 'voice' | 'comments' | 'publishing' | 'analytics' | 'agents';

const tabs: { id: StudioTab; label: string }[] = [
  { id: 'ideas', label: 'Ideas' },
  { id: 'trending_topics', label: 'Trending Topics' },
  { id: 'competitors', label: 'Competitors' },
  { id: 'brand_kit', label: 'Brand Kit' },
  { id: 'characters', label: 'Characters' },
  { id: 'caption_designer', label: 'Caption Designer' },
  { id: 'prompt_library', label: 'Prompt Library' },
  { id: 'content_calendar', label: 'Content Calendar' },
  { id: 'ab_testing', label: 'A/B Testing' },
  { id: 'script_lab', label: 'Script Lab' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'repurpose', label: 'Repurpose' },
  { id: 'storyboard', label: 'Storyboard' },
  { id: 'voice', label: 'Voice' },
  { id: 'comments', label: 'Comments' },
  { id: 'publishing', label: 'Publishing' },
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
            {!isLoading && activeTab === 'trending_topics' && <TrendingTopicsTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'competitors' && <CompetitorsTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'brand_kit' && <BrandKitTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'characters' && <CharacterConsistencyTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'caption_designer' && <CaptionDesignerTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'prompt_library' && <PromptLibraryTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'content_calendar' && <ContentCalendarTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'ab_testing' && <ABTestingTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'script_lab' && <ScriptLabTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'packaging' && <PackagingTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'repurpose' && <RepurposeTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'storyboard' && <StoryboardTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'voice' && <VoiceTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'comments' && <CommentsTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'publishing' && <PublishingTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'analytics' && <AnalyticsTab profileId={selectedProfileId} />}
            {!isLoading && activeTab === 'agents' && <AgentsTab profileId={selectedProfileId} />}
          </>
        )}
      </main>
    </div>
  );
};
