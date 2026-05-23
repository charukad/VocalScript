import { useEffect, useState } from 'react';
import { useContentProfileStore } from '../contentProfiles/contentProfileStore';
import {
  archiveCompetitorContent,
  createCompetitorContent,
  getCompetitorSummary,
  listCompetitorContent,
  updateCompetitorContent,
} from './api';
import type {
  CompetitorAnalysisSummary,
  CompetitorContent,
  CompetitorContentInput,
} from './types';

type CompetitorsTabProps = {
  profileId: string;
};

const emptySummary: CompetitorAnalysisSummary = {
  competitorCount: 0,
  contentCount: 0,
  averageViews: 0,
  averageEngagementRate: 0,
  topCompetitor: null,
  topTopic: null,
  strongestHook: null,
  averageVideoLengthSeconds: null,
  recommendations: [],
};

export const CompetitorsTab = ({ profileId }: CompetitorsTabProps) => {
  const { profiles } = useContentProfileStore();
  const profile = profiles.find(item => item.id === profileId) ?? null;
  const [items, setItems] = useState<CompetitorContent[]>([]);
  const [summary, setSummary] = useState<CompetitorAnalysisSummary>(emptySummary);
  const [draft, setDraft] = useState<CompetitorContentInput>({
    competitorName: profile?.competitors[0] ?? '',
    platform: profile?.platforms[0] ?? 'youtube_shorts',
    title: '',
    topic: '',
    hook: '',
    format: '',
    videoLengthSeconds: null,
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    notes: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const loadCompetitorData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [contentResponse, summaryResponse] = await Promise.all([
          listCompetitorContent(profileId),
          getCompetitorSummary(profileId),
        ]);
        if (ignore) return;
        setItems(contentResponse.items);
        setSummary(summaryResponse);
      } catch (error) {
        if (!ignore) setError(error instanceof Error ? error.message : 'Could not load competitor data');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };
    void loadCompetitorData();
    return () => { ignore = true; };
  }, [profileId]);

  const selectedPlatform = profile?.platforms.includes(draft.platform)
    ? draft.platform
    : profile?.platforms[0] ?? 'youtube_shorts';
  const selectedCompetitorName = draft.competitorName || profile?.competitors[0] || '';

  const refreshSummary = async () => {
    setSummary(await getCompetitorSummary(profileId));
  };

  const handleCreate = async () => {
    if (!selectedCompetitorName.trim() || !draft.title.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const created = await createCompetitorContent(profileId, {
        ...draft,
        competitorName: selectedCompetitorName,
        platform: selectedPlatform,
      });
      setItems(current => [created, ...current]);
      setDraft(current => ({
        ...current,
        title: '',
        topic: '',
        hook: '',
        format: '',
        videoLengthSeconds: null,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        notes: '',
      }));
      await refreshSummary();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save competitor content');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (itemId: string, input: Partial<CompetitorContentInput>) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateCompetitorContent(itemId, input);
      setItems(current => current.map(item => item.id === updated.id ? updated : item));
      await refreshSummary();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update competitor content');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async (itemId: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await archiveCompetitorContent(itemId);
      setItems(current => current.filter(item => item.id !== itemId));
      await refreshSummary();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not archive competitor content');
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
          <h2>Competitor Capture</h2>
        </header>
        {error && <div className="content-profile-error">{error}</div>}
        <label>
          Competitor
          <input
            value={selectedCompetitorName}
            onChange={event => setDraft(current => ({ ...current, competitorName: event.target.value }))}
            placeholder="Creator A"
          />
        </label>
        <label>
          Platform
          <select
            value={selectedPlatform}
            onChange={event => setDraft(current => ({
              ...current,
              platform: event.target.value as CompetitorContentInput['platform'],
            }))}
          >
            {profile.platforms.map(platform => (
              <option key={platform} value={platform}>{platform.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input
            value={draft.title}
            onChange={event => setDraft(current => ({ ...current, title: event.target.value }))}
          />
        </label>
        <label>
          Topic
          <input
            value={draft.topic ?? ''}
            onChange={event => setDraft(current => ({ ...current, topic: event.target.value }))}
          />
        </label>
        <label>
          Hook
          <textarea
            rows={3}
            value={draft.hook ?? ''}
            onChange={event => setDraft(current => ({ ...current, hook: event.target.value }))}
          />
        </label>
        <div className="studio-analytics-form-grid">
          <label>
            Length (s)
            <input
              type="number"
              min={0}
              value={draft.videoLengthSeconds ?? ''}
              onChange={event => setDraft(current => ({
                ...current,
                videoLengthSeconds: event.target.value ? Number(event.target.value) : null,
              }))}
            />
          </label>
          <label>
            Views
            <input
              type="number"
              min={0}
              value={draft.views ?? 0}
              onChange={event => setDraft(current => ({ ...current, views: Number(event.target.value) || 0 }))}
            />
          </label>
          <label>
            Likes
            <input
              type="number"
              min={0}
              value={draft.likes ?? 0}
              onChange={event => setDraft(current => ({ ...current, likes: Number(event.target.value) || 0 }))}
            />
          </label>
          <label>
            Shares
            <input
              type="number"
              min={0}
              value={draft.shares ?? 0}
              onChange={event => setDraft(current => ({ ...current, shares: Number(event.target.value) || 0 }))}
            />
          </label>
        </div>
        <label>
          Notes
          <textarea
            rows={3}
            value={draft.notes ?? ''}
            onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))}
          />
        </label>
        <button
          className="btn-primary"
          onClick={() => void handleCreate()}
          disabled={isSaving || !selectedCompetitorName.trim() || !draft.title.trim()}
        >
          Save Observation
        </button>
      </section>

      <section className="studio-panel studio-collection">
        <header>
          <h2>Competitor Analysis</h2>
          <span>{summary.contentCount} samples</span>
        </header>
        {isLoading && <div className="studio-empty">Loading competitor observations...</div>}
        {!isLoading && (
          <>
            <div className="studio-analytics-form-grid">
              <article className="studio-analytics-performance">
                <strong>Competitors</strong>
                <p>{summary.competitorCount}</p>
              </article>
              <article className="studio-analytics-performance">
                <strong>Average views</strong>
                <p>{summary.averageViews}</p>
              </article>
              <article className="studio-analytics-performance">
                <strong>Engagement</strong>
                <p>{summary.averageEngagementRate}%</p>
              </article>
              <article className="studio-analytics-performance">
                <strong>Average length</strong>
                <p>{summary.averageVideoLengthSeconds ?? '-'}s</p>
              </article>
            </div>
            <div className="studio-subsection">
              <h3>Signals</h3>
              <p>Top competitor: {summary.topCompetitor ?? '-'}</p>
              <p>Top topic: {summary.topTopic ?? '-'}</p>
              <p>Strongest hook: {summary.strongestHook ?? '-'}</p>
              {summary.recommendations.map(recommendation => (
                <p key={recommendation}>{recommendation}</p>
              ))}
            </div>
            {items.length === 0 && <div className="studio-empty">No competitor observations yet.</div>}
            {items.map(item => (
              <article className="studio-list-item" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.competitorName} · {item.platform.replaceAll('_', ' ')} · {item.views} views</p>
                </div>
                <textarea
                  rows={2}
                  value={item.hook}
                  onChange={event => void handleUpdate(item.id, { hook: event.target.value })}
                />
                <div className="studio-inline-actions">
                  <input
                    type="number"
                    min={0}
                    value={item.views}
                    onChange={event => void handleUpdate(item.id, { views: Number(event.target.value) || 0 })}
                  />
                  <button className="btn-secondary danger" onClick={() => void handleArchive(item.id)}>
                    Archive
                  </button>
                </div>
              </article>
            ))}
          </>
        )}
      </section>
    </div>
  );
};
