import { useMemo, useState } from 'react';
import {
  DEFAULT_CONTENT_PROFILE_INPUT,
  PLATFORM_OPTIONS,
  type ContentProfile,
  type ContentProfileInput,
  type PlatformTarget,
} from './types';

type ContentProfileFormProps = {
  profile?: ContentProfile | null;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (input: ContentProfileInput) => Promise<void>;
};

const profileToInput = (profile?: ContentProfile | null): ContentProfileInput => {
  if (!profile) return DEFAULT_CONTENT_PROFILE_INPUT;
  return {
    name: profile.name,
    description: profile.description,
    avatarPath: profile.avatarPath,
    platforms: profile.platforms,
    contentType: profile.contentType,
    targetAudience: profile.targetAudience,
    language: profile.language,
    tone: profile.tone,
    defaultVideoLengthSeconds: profile.defaultVideoLengthSeconds,
    voiceStyle: profile.voiceStyle,
    visualStyle: profile.visualStyle,
    hookStyle: profile.hookStyle,
    captionStyle: profile.captionStyle,
    brandColors: profile.brandColors,
    competitors: profile.competitors,
    postingGoals: profile.postingGoals,
    analyticsConnectionStatus: profile.analyticsConnectionStatus,
  };
};

const toCommaSeparated = (values: string[]): string => values.join(', ');

const fromCommaSeparated = (value: string): string[] => (
  value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
);

export const ContentProfileForm = ({
  profile,
  isSaving,
  onCancel,
  onSubmit,
}: ContentProfileFormProps) => {
  const initial = useMemo(() => profileToInput(profile), [profile]);
  const [draft, setDraft] = useState(initial);
  const [brandColorsText, setBrandColorsText] = useState(toCommaSeparated(initial.brandColors));
  const [competitorsText, setCompetitorsText] = useState(toCommaSeparated(initial.competitors));

  const setField = <K extends keyof ContentProfileInput>(key: K, value: ContentProfileInput[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
  };

  const togglePlatform = (platform: PlatformTarget) => {
    setDraft(current => {
      const platforms = current.platforms.includes(platform)
        ? current.platforms.filter(value => value !== platform)
        : [...current.platforms, platform];
      return { ...current, platforms };
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({
      ...draft,
      avatarPath: draft.avatarPath?.trim() || null,
      brandColors: fromCommaSeparated(brandColorsText),
      competitors: fromCommaSeparated(competitorsText),
    });
  };

  return (
    <form className="content-profile-form" onSubmit={handleSubmit}>
      <div className="content-profile-form-grid">
        <label>
          Name
          <input
            value={draft.name}
            onChange={event => setField('name', event.target.value)}
            required
          />
        </label>
        <label>
          Content type
          <input
            value={draft.contentType}
            onChange={event => setField('contentType', event.target.value)}
          />
        </label>
        <label>
          Target audience
          <input
            value={draft.targetAudience}
            onChange={event => setField('targetAudience', event.target.value)}
          />
        </label>
        <label>
          Language
          <input
            value={draft.language}
            onChange={event => setField('language', event.target.value)}
          />
        </label>
        <label>
          Typical length
          <input
            type="number"
            min={1}
            max={36000}
            value={draft.defaultVideoLengthSeconds}
            onChange={event => setField('defaultVideoLengthSeconds', Number(event.target.value) || 1)}
          />
        </label>
        <label>
          Avatar file path
          <input
            value={draft.avatarPath ?? ''}
            onChange={event => setField('avatarPath', event.target.value)}
            placeholder="/path/to/avatar.png"
          />
        </label>
      </div>

      <label>
        Description
        <textarea
          value={draft.description}
          onChange={event => setField('description', event.target.value)}
          rows={3}
        />
      </label>

      <fieldset>
        <legend>Platforms</legend>
        <div className="content-profile-platforms">
          {PLATFORM_OPTIONS.map(option => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={draft.platforms.includes(option.value)}
                onChange={() => togglePlatform(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="content-profile-form-grid">
        <label>
          Tone
          <input value={draft.tone} onChange={event => setField('tone', event.target.value)} />
        </label>
        <label>
          Voice style
          <input value={draft.voiceStyle} onChange={event => setField('voiceStyle', event.target.value)} />
        </label>
        <label>
          Visual style
          <input value={draft.visualStyle} onChange={event => setField('visualStyle', event.target.value)} />
        </label>
        <label>
          Hook style
          <input value={draft.hookStyle} onChange={event => setField('hookStyle', event.target.value)} />
        </label>
        <label>
          Caption style
          <input value={draft.captionStyle} onChange={event => setField('captionStyle', event.target.value)} />
        </label>
        <label>
          Brand colors
          <input
            value={brandColorsText}
            onChange={event => setBrandColorsText(event.target.value)}
            placeholder="#111111, #22cc88"
          />
        </label>
      </div>

      <div className="content-profile-form-grid single-wide">
        <label>
          Competitors
          <input
            value={competitorsText}
            onChange={event => setCompetitorsText(event.target.value)}
            placeholder="Creator A, Creator B"
          />
        </label>
        <label>
          Posting goals
          <textarea
            value={draft.postingGoals}
            onChange={event => setField('postingGoals', event.target.value)}
            rows={3}
          />
        </label>
      </div>

      <div className="content-profile-form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={isSaving || draft.platforms.length === 0}>
          {isSaving ? 'Saving...' : profile ? 'Save Profile' : 'Create Profile'}
        </button>
      </div>
    </form>
  );
};
