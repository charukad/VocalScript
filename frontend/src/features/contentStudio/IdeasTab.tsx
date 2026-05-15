import { useMemo, useState } from 'react';
import { PLATFORM_OPTIONS } from '../contentProfiles/types';
import { useContentStudioStore } from './contentStudioStore';
import type { ContentIdeaInput, ContentIdeaStatus } from './types';

type IdeasTabProps = {
  profileId: string;
};

const statusOptions: ContentIdeaStatus[] = ['draft', 'selected', 'converted_to_script'];

export const IdeasTab = ({ profileId }: IdeasTabProps) => {
  const { ideas, isSaving, createIdea, updateIdea, archiveIdea } = useContentStudioStore();
  const [draft, setDraft] = useState<ContentIdeaInput>({
    title: '',
    topic: '',
    hook: '',
    platform: null,
    status: 'draft',
  });
  const visibleIdeas = useMemo(() => ideas.filter(idea => idea.status !== 'archived'), [ideas]);

  const handleCreate = async () => {
    if (!draft.title.trim()) return;
    await createIdea(profileId, draft);
    setDraft({
      title: '',
      topic: '',
      hook: '',
      platform: null,
      status: 'draft',
    });
  };

  return (
    <div className="studio-split">
      <section className="studio-panel">
        <header>
          <h2>Ideas</h2>
        </header>
        <label>
          Title
          <input
            value={draft.title}
            onChange={event => setDraft(current => ({ ...current, title: event.target.value }))}
            placeholder="Three AI habits beginners miss"
          />
        </label>
        <label>
          Topic
          <input
            value={draft.topic ?? ''}
            onChange={event => setDraft(current => ({ ...current, topic: event.target.value }))}
            placeholder="AI education"
          />
        </label>
        <label>
          Platform
          <select
            value={draft.platform ?? ''}
            onChange={event => setDraft(current => ({
              ...current,
              platform: (event.target.value || null) as ContentIdeaInput['platform'],
            }))}
          >
            <option value="">Unset</option>
            {PLATFORM_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          Hook
          <textarea
            rows={4}
            value={draft.hook ?? ''}
            onChange={event => setDraft(current => ({ ...current, hook: event.target.value }))}
            placeholder="Most creators overlook the third one."
          />
        </label>
        <button className="btn-primary" onClick={() => void handleCreate()} disabled={isSaving || !draft.title.trim()}>
          Save Idea
        </button>
      </section>

      <section className="studio-panel studio-collection">
        <header>
          <h2>Saved Ideas</h2>
          <span>{visibleIdeas.length}</span>
        </header>
        {visibleIdeas.length === 0 && <div className="studio-empty">No ideas yet.</div>}
        {visibleIdeas.map(idea => (
          <article className="studio-list-item" key={idea.id}>
            <div>
              <strong>{idea.title}</strong>
              <p>{idea.topic || 'Untitled topic'}</p>
            </div>
            <textarea
              rows={3}
              value={idea.hook}
              onChange={event => void updateIdea(idea.id, { hook: event.target.value })}
            />
            <div className="studio-inline-actions">
              <select
                value={idea.status}
                onChange={event => void updateIdea(idea.id, { status: event.target.value as ContentIdeaStatus })}
              >
                {statusOptions.map(status => (
                  <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
                ))}
              </select>
              <button className="btn-secondary danger" onClick={() => void archiveIdea(idea.id)}>
                Archive
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
};
