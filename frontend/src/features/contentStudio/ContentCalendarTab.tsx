import { useEffect, useMemo, useState } from 'react';
import { useContentProfileStore } from '../contentProfiles/contentProfileStore';
import {
  archiveCalendarItem,
  createCalendarItem,
  listCalendarItems,
  updateCalendarItem,
} from './api';
import { useContentStudioStore } from './contentStudioStore';
import type {
  CalendarItem,
  CalendarItemInput,
  CalendarItemStatus,
} from './types';

type ContentCalendarTabProps = {
  profileId: string;
};

const statusOptions: CalendarItemStatus[] = ['planned', 'drafting', 'ready', 'published'];

const nowPlusOneDay = (): string => {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

const toInputValue = (value: string): string => {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

const toIso = (value: string): string => new Date(value).toISOString();

export const ContentCalendarTab = ({ profileId }: ContentCalendarTabProps) => {
  const { profiles } = useContentProfileStore();
  const profile = profiles.find(item => item.id === profileId) ?? null;
  const { ideas, scripts } = useContentStudioStore();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [draft, setDraft] = useState<CalendarItemInput>({
    title: '',
    scheduledAt: toIso(nowPlusOneDay()),
    platform: profile?.platforms[0] ?? null,
    status: 'planned',
    ideaId: null,
    scriptId: null,
    notes: '',
  });
  const [scheduledInput, setScheduledInput] = useState(nowPlusOneDay());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visibleItems = useMemo(() => items.filter(item => item.status !== 'archived'), [items]);

  useEffect(() => {
    setDraft(current => ({
      ...current,
      platform: current.platform && profile?.platforms.includes(current.platform)
        ? current.platform
        : profile?.platforms[0] ?? null,
    }));
  }, [profile]);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    listCalendarItems(profileId)
      .then(response => setItems(response.items))
      .catch(error => setError(error instanceof Error ? error.message : 'Could not load calendar items'))
      .finally(() => setIsLoading(false));
  }, [profileId]);

  const handleCreate = async () => {
    if (!draft.title.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const created = await createCalendarItem(profileId, {
        ...draft,
        scheduledAt: toIso(scheduledInput),
      });
      setItems(current => [...current, created].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
      setDraft(current => ({
        ...current,
        title: '',
        ideaId: null,
        scriptId: null,
        notes: '',
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save calendar item');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (itemId: string, input: Partial<CalendarItemInput>) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateCalendarItem(itemId, input);
      setItems(current => current
        .map(item => item.id === updated.id ? updated : item)
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update calendar item');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async (itemId: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await archiveCalendarItem(itemId);
      setItems(current => current.filter(item => item.id !== itemId));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not archive calendar item');
    } finally {
      setIsSaving(false);
    }
  };

  if (!profile) {
    return <div className="studio-empty studio-empty-large">Profile details are still loading.</div>;
  }

  return (
    <div className="studio-split">
      <section className="studio-panel">
        <header>
          <h2>Schedule Content</h2>
        </header>
        {error && <div className="content-profile-error">{error}</div>}
        <label>
          Title
          <input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} />
        </label>
        <label>
          Publish time
          <input
            type="datetime-local"
            value={scheduledInput}
            onChange={event => setScheduledInput(event.target.value)}
          />
        </label>
        <label>
          Platform
          <select
            value={draft.platform ?? ''}
            onChange={event => setDraft(current => ({
              ...current,
              platform: (event.target.value || null) as CalendarItemInput['platform'],
            }))}
          >
            {profile.platforms.map(platform => (
              <option key={platform} value={platform}>{platform.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </label>
        <label>
          Linked idea
          <select
            value={draft.ideaId ?? ''}
            onChange={event => setDraft(current => ({ ...current, ideaId: event.target.value || null }))}
          >
            <option value="">None</option>
            {ideas.map(idea => <option key={idea.id} value={idea.id}>{idea.title}</option>)}
          </select>
        </label>
        <label>
          Linked script
          <select
            value={draft.scriptId ?? ''}
            onChange={event => setDraft(current => ({ ...current, scriptId: event.target.value || null }))}
          >
            <option value="">None</option>
            {scripts.map(script => <option key={script.id} value={script.id}>{script.title}</option>)}
          </select>
        </label>
        <label>
          Notes
          <textarea rows={3} value={draft.notes ?? ''} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} />
        </label>
        <button className="btn-primary" onClick={() => void handleCreate()} disabled={isSaving || !draft.title.trim()}>
          Add to Calendar
        </button>
      </section>

      <section className="studio-panel studio-collection">
        <header>
          <h2>Upcoming</h2>
          <span>{visibleItems.length}</span>
        </header>
        {isLoading && <div className="studio-empty">Loading calendar items...</div>}
        {!isLoading && visibleItems.length === 0 && <div className="studio-empty">No scheduled content yet.</div>}
        {visibleItems.map(item => (
          <article className="studio-list-item" key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <p>{new Date(item.scheduledAt).toLocaleString()} · {item.platform?.replaceAll('_', ' ') ?? 'platform unset'}</p>
            </div>
            <input
              type="datetime-local"
              value={toInputValue(item.scheduledAt)}
              onChange={event => void handleUpdate(item.id, { scheduledAt: toIso(event.target.value) })}
            />
            <textarea
              rows={2}
              value={item.notes}
              onChange={event => void handleUpdate(item.id, { notes: event.target.value })}
            />
            <div className="studio-inline-actions">
              <select
                value={item.status}
                onChange={event => void handleUpdate(item.id, { status: event.target.value as CalendarItemStatus })}
              >
                {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
              <button className="btn-secondary danger" onClick={() => void handleArchive(item.id)}>
                Archive
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
};
