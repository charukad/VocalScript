import { useEffect, useMemo, useState } from 'react';
import { PLATFORM_OPTIONS } from '../contentProfiles/types';
import { useContentStudioStore } from './contentStudioStore';
import { importTrendRss, listTrendSources } from './api';
import type { ContentTrendInput, ContentTrendStatus, TrendSource } from './types';

type TrendingTopicsTabProps = {
  profileId: string;
};

const statusOptions: ContentTrendStatus[] = ['active', 'selected', 'converted_to_idea'];

export const TrendingTopicsTab = ({ profileId }: TrendingTopicsTabProps) => {
  const { trends, isSaving, loadProfileWorkspace, createTrend, suggestTrends, updateTrend, archiveTrend } = useContentStudioStore();
  const [draft, setDraft] = useState<ContentTrendInput>({
    topic: '',
    platform: null,
    trendScore: null,
    suggestedAngle: '',
    suggestedHook: '',
    source: 'manual',
    status: 'active',
  });
  const [rssUrl, setRssUrl] = useState('');
  const [rssSourceName, setRssSourceName] = useState('rss_feed');
  const [sources, setSources] = useState<TrendSource[]>([]);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const visibleTrends = useMemo(() => trends.filter(trend => trend.status !== 'archived'), [trends]);

  useEffect(() => {
    listTrendSources()
      .then(response => setSources(response.sources))
      .catch(() => setSources([]));
  }, []);

  const handleCreate = async () => {
    if (!draft.topic.trim()) return;
    await createTrend(profileId, draft);
    setDraft({
      topic: '',
      platform: null,
      trendScore: null,
      suggestedAngle: '',
      suggestedHook: '',
      source: 'manual',
      status: 'active',
    });
  };

  const handleImportRss = async () => {
    if (!rssUrl.trim()) return;
    setIsImporting(true);
    setImportMessage(null);
    try {
      const result = await importTrendRss(profileId, {
        feedUrl: rssUrl,
        sourceName: rssSourceName || 'rss_feed',
        maxItems: 8,
        platform: draft.platform ?? null,
      });
      await loadProfileWorkspace(profileId);
      setImportMessage(`${result.importedCount} imported · ${result.skippedCount} skipped`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'Could not import RSS trends');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="studio-split">
      <section className="studio-panel">
        <header>
          <h2>Trending Topics</h2>
        </header>
        <label>
          Topic
          <input
            value={draft.topic}
            onChange={event => setDraft(current => ({ ...current, topic: event.target.value }))}
            placeholder="AI tools replacing old workflows"
          />
        </label>
        <label>
          Platform
          <select
            value={draft.platform ?? ''}
            onChange={event => setDraft(current => ({
              ...current,
              platform: (event.target.value || null) as ContentTrendInput['platform'],
            }))}
          >
            <option value="">Unset</option>
            {PLATFORM_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          Trend score
          <input
            type="number"
            min={0}
            max={100}
            value={draft.trendScore ?? ''}
            onChange={event => setDraft(current => ({
              ...current,
              trendScore: event.target.value === '' ? null : Number(event.target.value),
            }))}
          />
        </label>
        <label>
          Suggested angle
          <textarea
            rows={3}
            value={draft.suggestedAngle ?? ''}
            onChange={event => setDraft(current => ({ ...current, suggestedAngle: event.target.value }))}
            placeholder="Show why this matters right now."
          />
        </label>
        <label>
          Suggested hook
          <textarea
            rows={3}
            value={draft.suggestedHook ?? ''}
            onChange={event => setDraft(current => ({ ...current, suggestedHook: event.target.value }))}
            placeholder="This change is happening faster than people think."
          />
        </label>
        <div className="studio-inline-actions">
          <button className="btn-primary" onClick={() => void handleCreate()} disabled={isSaving || !draft.topic.trim()}>
            Save Trend
          </button>
          <button className="btn-secondary" onClick={() => void suggestTrends(profileId)} disabled={isSaving}>
            Suggest Local Trends
          </button>
        </div>
        <div className="studio-subsection">
          <h3>External Feed Import</h3>
          <label>
            RSS / Atom URL
            <input value={rssUrl} onChange={event => setRssUrl(event.target.value)} placeholder="https://example.com/feed.xml" />
          </label>
          <label>
            Source label
            <input value={rssSourceName} onChange={event => setRssSourceName(event.target.value)} />
          </label>
          <button className="btn-secondary" onClick={() => void handleImportRss()} disabled={isImporting || !rssUrl.trim()}>
            {isImporting ? 'Importing...' : 'Import Feed'}
          </button>
          {importMessage && <p>{importMessage}</p>}
        </div>
      </section>

      <section className="studio-panel studio-collection">
        <header>
          <h2>Trend Radar</h2>
          <span>{visibleTrends.length}</span>
        </header>
        {sources.length > 0 && (
          <div className="studio-subsection">
            <h3>Sources</h3>
            {sources.map(source => (
              <p key={source.key}>
                {source.displayName} · {source.status.replaceAll('_', ' ')}
              </p>
            ))}
          </div>
        )}
        {visibleTrends.length === 0 && <div className="studio-empty">No trends yet.</div>}
        {visibleTrends.map(trend => (
          <article className="studio-list-item" key={trend.id}>
            <div>
              <strong>{trend.topic}</strong>
              <p>{trend.source.replaceAll('_', ' ')} · score {trend.trendScore ?? '-'}</p>
            </div>
            <textarea
              rows={2}
              value={trend.suggestedAngle}
              onChange={event => void updateTrend(trend.id, { suggestedAngle: event.target.value })}
            />
            <textarea
              rows={2}
              value={trend.suggestedHook}
              onChange={event => void updateTrend(trend.id, { suggestedHook: event.target.value })}
            />
            {trend.contentIdeaSuggestions.length > 0 && (
              <p>{trend.contentIdeaSuggestions.join(' · ')}</p>
            )}
            <div className="studio-inline-actions">
              <select
                value={trend.status}
                onChange={event => void updateTrend(trend.id, { status: event.target.value as ContentTrendStatus })}
              >
                {statusOptions.map(status => (
                  <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
                ))}
              </select>
              <button className="btn-secondary danger" onClick={() => void archiveTrend(trend.id)}>
                Archive
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
};
