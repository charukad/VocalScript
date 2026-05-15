import { useEffect, useMemo, useState } from 'react';
import { ContentProfileDetail } from './ContentProfileDetail';
import { ContentProfileForm } from './ContentProfileForm';
import { ContentProfileList } from './ContentProfileList';
import { useContentProfileStore } from './contentProfileStore';
import type { ContentProfileInput } from './types';

type ContentProfilesPanelProps = {
  onClose: () => void;
};

type PanelMode = 'detail' | 'create' | 'edit';

export const ContentProfilesPanel = ({ onClose }: ContentProfilesPanelProps) => {
  const {
    profiles,
    selectedProfileId,
    isLoading,
    isSaving,
    error,
    loadProfiles,
    selectProfile,
    createProfile,
    updateProfile,
    archiveProfile,
  } = useContentProfileStore();
  const [mode, setMode] = useState<PanelMode>('detail');
  const selectedProfile = useMemo(
    () => profiles.find(profile => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const handleCreate = async (input: ContentProfileInput) => {
    await createProfile(input);
    setMode('detail');
  };

  const handleUpdate = async (input: ContentProfileInput) => {
    if (!selectedProfile) return;
    await updateProfile(selectedProfile.id, input);
    setMode('detail');
  };

  const handleArchive = async () => {
    if (!selectedProfile) return;
    const confirmed = window.confirm(`Archive "${selectedProfile.name}"?`);
    if (!confirmed) return;
    await archiveProfile(selectedProfile.id);
    setMode('detail');
  };

  return (
    <div className="content-profiles-shell">
      <div className="content-profiles-panel">
        <header className="content-profiles-header">
          <div>
            <h2>Content Profiles</h2>
            <p>Creator brands, channels, and platform defaults.</p>
          </div>
          <div className="content-profiles-header-actions">
            <button className="btn-secondary" onClick={() => setMode('create')}>New Profile</button>
            <button className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        </header>

        {error && <div className="content-profile-error">{error}</div>}

        <div className="content-profiles-body">
          <aside className="content-profiles-sidebar">
            {isLoading ? (
              <div className="content-profile-empty">Loading profiles...</div>
            ) : (
              <ContentProfileList
                profiles={profiles}
                selectedProfileId={selectedProfileId}
                onSelect={(profileId) => {
                  selectProfile(profileId);
                  setMode('detail');
                }}
              />
            )}
          </aside>

          <main className="content-profiles-main">
            {mode === 'create' && (
              <ContentProfileForm
                isSaving={isSaving}
                onCancel={() => setMode('detail')}
                onSubmit={handleCreate}
              />
            )}
            {mode === 'edit' && (
              <ContentProfileForm
                profile={selectedProfile}
                isSaving={isSaving}
                onCancel={() => setMode('detail')}
                onSubmit={handleUpdate}
              />
            )}
            {mode === 'detail' && (
              <ContentProfileDetail
                profile={selectedProfile}
                onEdit={() => setMode('edit')}
                onArchive={() => void handleArchive()}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
