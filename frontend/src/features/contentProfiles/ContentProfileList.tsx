import type { ContentProfile } from './types';

type ContentProfileListProps = {
  profiles: ContentProfile[];
  selectedProfileId: string | null;
  onSelect: (profileId: string) => void;
};

export const ContentProfileList = ({
  profiles,
  selectedProfileId,
  onSelect,
}: ContentProfileListProps) => {
  if (profiles.length === 0) {
    return <div className="content-profile-empty">No content profiles yet.</div>;
  }

  return (
    <div className="content-profile-list">
      {profiles.map(profile => (
        <button
          key={profile.id}
          className={`content-profile-row ${profile.id === selectedProfileId ? 'selected' : ''}`}
          onClick={() => onSelect(profile.id)}
        >
          <strong>{profile.name}</strong>
          <span>{profile.platforms.join(', ')}</span>
        </button>
      ))}
    </div>
  );
};
