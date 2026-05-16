import { useEffect, useMemo, useState } from 'react';
import { useContentProfileStore } from '../contentProfiles/contentProfileStore';
import {
  importManualPerformance,
  listAnalyticsConnections,
  listContentPerformance,
  listProfileLearnings,
  startAgentWorkflow,
  updateAnalyticsConnection,
} from './api';
import type {
  AnalyticsConnection,
  AnalyticsConnectionStatus,
  AnalyticsMetrics,
  ContentPerformance,
  ManualPerformanceInput,
  ProfileLearning,
} from './types';

type AnalyticsTabProps = {
  profileId: string;
};

const EMPTY_METRICS: AnalyticsMetrics = {
  views: 0,
  impressions: 0,
  ctr: 0,
  averageViewDurationSeconds: 0,
  audienceRetentionPercent: 0,
  watchTimeMinutes: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  followersGained: 0,
};

export const AnalyticsTab = ({ profileId }: AnalyticsTabProps) => {
  const { profiles, loadProfiles } = useContentProfileStore();
  const profile = profiles.find(item => item.id === profileId) ?? null;
  const [connections, setConnections] = useState<AnalyticsConnection[]>([]);
  const [performance, setPerformance] = useState<ContentPerformance[]>([]);
  const [learnings, setLearnings] = useState<ProfileLearning[]>([]);
  const [connectionDrafts, setConnectionDrafts] = useState<Record<string, AnalyticsConnectionStatus>>({});
  const [draft, setDraft] = useState<ManualPerformanceInput>({
    platform: profile?.platforms[0] ?? 'youtube_shorts',
    title: '',
    metrics: EMPTY_METRICS,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(current => ({
      ...current,
      platform: profile?.platforms.includes(current.platform)
        ? current.platform
        : profile?.platforms[0] ?? 'youtube_shorts',
    }));
  }, [profile]);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    Promise.all([
      listAnalyticsConnections(profileId),
      listContentPerformance(profileId),
      listProfileLearnings(profileId),
    ])
      .then(([connectionResponse, performanceResponse, learningResponse]) => {
        setConnections(connectionResponse.connections);
        setPerformance(performanceResponse.performance);
        setLearnings(learningResponse.learnings);
        setConnectionDrafts(Object.fromEntries(
          connectionResponse.connections.map(connection => [connection.platform, connection.status]),
        ));
      })
      .catch(error => setError(error instanceof Error ? error.message : 'Could not load analytics data'))
      .finally(() => setIsLoading(false));
  }, [profileId]);

  const connectionByPlatform = useMemo(
    () => new Map(connections.map(connection => [connection.platform, connection])),
    [connections],
  );

  const setMetric = <K extends keyof AnalyticsMetrics>(key: K, value: AnalyticsMetrics[K]) => {
    setDraft(current => ({ ...current, metrics: { ...current.metrics, [key]: value } }));
  };

  const handleSaveConnection = async (platform: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const existing = connectionByPlatform.get(platform as AnalyticsConnection['platform']);
      const connection = await updateAnalyticsConnection(profileId, platform, {
        status: connectionDrafts[platform] ?? existing?.status ?? 'manual_only',
        displayName: existing?.displayName ?? '',
        externalAccountId: existing?.externalAccountId ?? null,
      });
      setConnections(current => {
        const others = current.filter(item => item.platform !== connection.platform);
        return [...others, connection].sort((left, right) => left.platform.localeCompare(right.platform));
      });
      await loadProfiles();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save analytics connection');
    } finally {
      setIsSaving(false);
    }
  };

  const handleImport = async () => {
    if (!draft.title.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const imported = await importManualPerformance(profileId, draft);
      setPerformance(current => [imported, ...current]);
      setDraft(current => ({ ...current, title: '', metrics: EMPTY_METRICS }));
      await loadProfiles();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not import analytics performance');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunLearningWorkflow = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await startAgentWorkflow({
        profileId,
        workflowType: 'analytics_learning',
        createDrafts: false,
      });
      const response = await listProfileLearnings(profileId);
      setLearnings(response.learnings);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not run analytics learning workflow');
    } finally {
      setIsSaving(false);
    }
  };

  if (!profile) {
    return <div className="studio-empty studio-empty-large">Profile details are still loading.</div>;
  }

  return (
    <div className="studio-analytics-grid">
      <section className="studio-panel">
        <header>
          <h2>Connections</h2>
          <span>{profile.platforms.length}</span>
        </header>
        {isLoading && <div className="studio-empty">Loading analytics...</div>}
        {profile.platforms.map(platform => {
          const connection = connectionByPlatform.get(platform);
          return (
            <article className="studio-analytics-connection" key={platform}>
              <strong>{platform.replaceAll('_', ' ')}</strong>
              <label>
                Status
                <select
                  value={connectionDrafts[platform] ?? connection?.status ?? profile.analyticsConnectionStatus[platform] ?? 'not_connected'}
                  onChange={event => setConnectionDrafts(current => ({
                    ...current,
                    [platform]: event.target.value as AnalyticsConnectionStatus,
                  }))}
                >
                  <option value="not_connected">Not connected</option>
                  <option value="manual_only">Manual only</option>
                  <option value="connected">Connected</option>
                  <option value="error">Error</option>
                </select>
              </label>
              <button className="btn-secondary" onClick={() => void handleSaveConnection(platform)} disabled={isSaving}>
                Save
              </button>
            </article>
          );
        })}
      </section>

      <section className="studio-panel studio-analytics-main">
        <header>
          <h2>Manual Metrics Import</h2>
          <span>{performance.length} records</span>
        </header>
        {error && <div className="content-profile-error">{error}</div>}
        <div className="studio-analytics-form-grid">
          <label>
            Platform
            <select
              value={draft.platform}
              onChange={event => setDraft(current => ({ ...current, platform: event.target.value as ManualPerformanceInput['platform'] }))}
            >
              {profile.platforms.map(platform => (
                <option key={platform} value={platform}>{platform.replaceAll('_', ' ')}</option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} />
          </label>
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
            Hook type
            <input value={draft.hookType ?? ''} onChange={event => setDraft(current => ({ ...current, hookType: event.target.value }))} />
          </label>
          <label>
            Views
            <input type="number" min={0} value={draft.metrics.views} onChange={event => setMetric('views', Number(event.target.value) || 0)} />
          </label>
          <label>
            Impressions
            <input type="number" min={0} value={draft.metrics.impressions} onChange={event => setMetric('impressions', Number(event.target.value) || 0)} />
          </label>
          <label>
            CTR
            <input type="number" min={0} step={0.1} value={draft.metrics.ctr} onChange={event => setMetric('ctr', Number(event.target.value) || 0)} />
          </label>
          <label>
            Avg view duration
            <input
              type="number"
              min={0}
              step={0.1}
              value={draft.metrics.averageViewDurationSeconds}
              onChange={event => setMetric('averageViewDurationSeconds', Number(event.target.value) || 0)}
            />
          </label>
          <label>
            Retention %
            <input
              type="number"
              min={0}
              step={0.1}
              value={draft.metrics.audienceRetentionPercent}
              onChange={event => setMetric('audienceRetentionPercent', Number(event.target.value) || 0)}
            />
          </label>
          <label>
            Shares
            <input type="number" min={0} value={draft.metrics.shares} onChange={event => setMetric('shares', Number(event.target.value) || 0)} />
          </label>
        </div>
        <div className="studio-inline-actions">
          <button className="btn-primary" onClick={() => void handleImport()} disabled={isSaving || !draft.title.trim()}>
            Import Metrics
          </button>
          <button className="btn-secondary" onClick={() => void handleRunLearningWorkflow()} disabled={isSaving}>
            Run Learning Workflow
          </button>
        </div>

        <div className="studio-subsection">
          <h3>Profile Learnings</h3>
          {learnings.length === 0 && <div className="studio-empty">No profile learnings yet.</div>}
          {learnings.map(learning => (
            <article className="studio-analytics-performance" key={learning.id}>
              <div>
                <strong>{learning.learningType.replaceAll('_', ' ')}</strong>
                <span>{new Date(learning.updatedAt).toLocaleDateString()}</span>
              </div>
              <p>{learning.summary}</p>
            </article>
          ))}
        </div>

        <div className="studio-subsection">
          <h3>Imported Performance</h3>
          {performance.length === 0 && <div className="studio-empty">No analytics imported yet.</div>}
          {performance.map(item => (
            <article className="studio-analytics-performance" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.platform.replaceAll('_', ' ')}</span>
              </div>
              <p>{item.metrics.views} views · {item.metrics.audienceRetentionPercent}% retention · {item.metrics.shares} shares</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
