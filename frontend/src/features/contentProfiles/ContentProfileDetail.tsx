import type { ContentProfile } from './types';
import { PLATFORM_OPTIONS } from './types';

type ContentProfileDetailProps = {
  profile: ContentProfile | null;
  onEdit: () => void;
  onArchive: () => void;
};

const platformLabel = (value: string): string => (
  PLATFORM_OPTIONS.find(option => option.value === value)?.label ?? value
);

export const ContentProfileDetail = ({
  profile,
  onEdit,
  onArchive,
}: ContentProfileDetailProps) => {
  if (!profile) {
    return (
      <div className="content-profile-empty detail">
        Select a profile or create a new one.
      </div>
    );
  }

  return (
    <div className="content-profile-detail">
      <div className="content-profile-detail-header">
        <div>
          <h3>{profile.name}</h3>
          <p>{profile.description || 'No description yet.'}</p>
        </div>
        <div className="content-profile-actions">
          <button className="btn-secondary" onClick={onEdit}>Edit</button>
          <button className="btn-secondary danger" onClick={onArchive}>Archive</button>
        </div>
      </div>

      <div className="content-profile-chip-row">
        {profile.platforms.map(platform => (
          <span key={platform}>{platformLabel(platform)}</span>
        ))}
      </div>

      <dl className="content-profile-meta">
        <div>
          <dt>Content type</dt>
          <dd>{profile.contentType}</dd>
        </div>
        <div>
          <dt>Audience</dt>
          <dd>{profile.targetAudience}</dd>
        </div>
        <div>
          <dt>Language</dt>
          <dd>{profile.language}</dd>
        </div>
        <div>
          <dt>Typical length</dt>
          <dd>{profile.defaultVideoLengthSeconds}s</dd>
        </div>
        <div>
          <dt>Tone</dt>
          <dd>{profile.tone}</dd>
        </div>
        <div>
          <dt>Voice</dt>
          <dd>{profile.voiceStyle}</dd>
        </div>
        <div>
          <dt>Visual style</dt>
          <dd>{profile.visualStyle}</dd>
        </div>
        <div>
          <dt>Hook style</dt>
          <dd>{profile.hookStyle}</dd>
        </div>
        <div>
          <dt>Caption style</dt>
          <dd>{profile.captionStyle}</dd>
        </div>
        <div>
          <dt>Avatar reference</dt>
          <dd>{profile.avatarPath || 'None'}</dd>
        </div>
      </dl>

      <section className="content-profile-section">
        <h4>Posting goals</h4>
        <p>{profile.postingGoals || 'No posting goals yet.'}</p>
      </section>

      <section className="content-profile-section">
        <h4>Brand colors</h4>
        <div className="content-profile-chip-row">
          {profile.brandColors.length === 0 && <span>None</span>}
          {profile.brandColors.map(color => (
            <span key={color}>{color}</span>
          ))}
        </div>
      </section>

      <section className="content-profile-section">
        <h4>Competitors</h4>
        <p>{profile.competitors.join(', ') || 'None'}</p>
      </section>
    </div>
  );
};
