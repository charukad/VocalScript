import React from 'react';
import {
  assignGenerationJobWorker,
  clearBrowserBridgeWorkerError,
  clearBrowserBridgeWorkerCooldown,
  clearDisconnectedBridgeWorkers,
  clearBrowserBridgeDebugScreenshots,
  clearGenerationJobHistory,
  createExtendVideoJob,
  fallbackGenerationJob,
  getBrowserBridgeStatus,
  listBrowserBridgeAdapterTests,
  listBrowserBridgeDebugEvents,
  listGenerationJobs,
  pauseBrowserBridgeWorker,
  pauseGenerationBatch,
  regenerateGenerationJobVariant,
  resolveBackendMediaUrl,
  resumeBrowserBridgeWorker,
  resumeGenerationBatch,
  retryGenerationJob,
  runBrowserBridgeAdapterTest,
  runBrowserBridgeHealthCheck,
  selectGenerationJobVariant,
  selectShortsFinalClip,
  storeRemoteGenerationJob,
  updateBrowserBridgeWorkerNickname,
} from '../../lib/api/client';
import type {
  BridgeDebugEvent,
  BridgeAdapterTestRecord,
  BridgeWorkerSnapshot,
  GeneratedMediaType,
  GenerationJob,
  GenerationJobStatus,
  ProviderCapability,
  ProviderHealthSnapshot,
  ProviderName,
} from '../../types';

type BrowserBridgeMonitorProps = {
  onClose: () => void;
};

type MonitorTab = 'active' | 'disconnected';
type QueueFlowFilter = 'all' | 'auto_generate' | 'auto_animate';
type QueueStatusFilter = 'all' | GenerationJobStatus;
type QueueProviderFilter = 'all' | ProviderName;
type QueueMediaFilter = 'all' | GeneratedMediaType;

const queueStatuses: GenerationJobStatus[] = [
  'queued',
  'running',
  'completed',
  'failed',
  'manual_action_required',
  'canceled',
];

const failedQueueStatuses: GenerationJobStatus[] = ['failed', 'manual_action_required', 'canceled'];
const finishedQueueStatuses: GenerationJobStatus[] = ['completed', 'failed', 'manual_action_required', 'canceled'];
const bridgeProviders: ProviderName[] = ['meta', 'grok'];
const runnableBridgeProviders: ProviderName[] = ['meta'];

const statusLabel = (status: BridgeWorkerSnapshot['status']) => status.replaceAll('_', ' ');

const isWorkerConnectedNow = (worker: BridgeWorkerSnapshot): boolean =>
  worker.status !== 'disconnected' && worker.status !== 'stale' && !worker.disconnectedAt;

const shortWorkerId = (workerId: string): string => workerId.replace(/^neuralscribe-/, '').slice(0, 8);

const workerDisplayName = (worker: BridgeWorkerSnapshot): string =>
  worker.nickname ||
  worker.chromeProfileLabel ||
  worker.accountLabel ||
  worker.profileEmail ||
  `Profile ${shortWorkerId(worker.workerId)}`;

const workerLabelById = (workers: BridgeWorkerSnapshot[], workerId: string): string => {
  const worker = workers.find(candidate => candidate.workerId === workerId);
  return worker ? workerDisplayName(worker) : shortWorkerId(workerId);
};

const providerCanRunWithWorkers = (
  workers: BridgeWorkerSnapshot[],
  provider: ProviderName,
  mediaType: GeneratedMediaType,
  requireExtend = false
): boolean => workers.some(worker => {
  if (!runnableBridgeProviders.includes(provider)) return false;
  if (!isWorkerConnectedNow(worker)) return false;
  if (!worker.providers.includes(provider)) return false;
  const capability = worker.capabilities.find(item => item.provider === provider);
  if (!capability) return !requireExtend;
  if (requireExtend) return capability.canExtendVideo;
  return mediaType === 'video' ? capability.canGenerateVideo : capability.canGenerateImage;
});

const formatTime = (value: string | null | undefined): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString();
};

const formatCooldown = (value: string | null): string => {
  if (!value) return '-';
  const remainingMs = new Date(value).getTime() - Date.now();
  if (remainingMs <= 0) return '-';
  const seconds = Math.ceil(remainingMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)}m`;
};

const capabilityText = (capability: ProviderCapability): string => {
  const enabled = [
    capability.canGenerateImage ? 'image' : '',
    capability.canGenerateVideo ? 'video' : '',
    capability.canExtendVideo ? 'extend' : '',
    capability.supportsVariants ? 'variants' : '',
  ].filter(Boolean);
  return `${capability.provider}: ${enabled.length ? enabled.join(', ') : 'detecting'}`;
};

const healthLabel = (health: ProviderHealthSnapshot): string =>
  `${health.provider}: ${health.status.replaceAll('_', ' ')}`;

const eventTime = (event: BridgeDebugEvent): string => formatTime(event.createdAt);

const eventElapsedLabel = (events: BridgeDebugEvent[], event: BridgeDebugEvent): string => {
  const firstEvent = events[0];
  if (!firstEvent) return '';
  const startMs = new Date(firstEvent.createdAt).getTime();
  const eventMs = new Date(event.createdAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(eventMs) || eventMs < startMs) return '';
  return `+${Math.round((eventMs - startMs) / 1000)}s`;
};

const queueStatusLabel = (status: GenerationJobStatus): string => status.replaceAll('_', ' ');

const queueFlow = (job: GenerationJob): 'auto_generate' | 'auto_animate' =>
  job.metadata.flow === 'auto_animate' || job.metadata.source === 'auto_animate'
    ? 'auto_animate'
    : 'auto_generate';

const queueFlowLabel = (job: GenerationJob): string =>
  queueFlow(job) === 'auto_animate' ? 'Auto Animate' : 'Auto Generate';

const queueSubject = (job: GenerationJob): string =>
  job.metadata.animationAssetName ||
  job.metadata.assetName ||
  job.metadata.assetNeedName ||
  job.metadata.sceneTitle ||
  job.sceneId ||
  'scene';

const queueProjectLabel = (job: GenerationJob): string =>
  job.metadata.projectName || job.projectId || 'No project';

const queueWorkerId = (job: GenerationJob): string => job.metadata.workerId || job.metadata.assignedWorkerId || '';

const queueAssignedWorkerId = (job: GenerationJob): string => job.metadata.assignedWorkerId || '';

const canRetryQueueJob = (job: GenerationJob): boolean =>
  failedQueueStatuses.includes(job.status);

const queueResultLabel = (job: GenerationJob): string => {
  const variants = job.resultVariants?.length ?? 0;
  if (variants > 0) return `${variants} variant${variants === 1 ? '' : 's'}`;
  if (job.resultUrl) return '1 result';
  return '-';
};

const jobTypeLabel = (job: GenerationJob): string =>
  job.metadata.jobType === 'extend_video' ? 'Extend Video' : job.mediaType;

const isExtendVideoJob = (job: GenerationJob): boolean => job.metadata.jobType === 'extend_video';

const jobDurationLabel = (job: GenerationJob): string => {
  const start = Number(job.metadata.sceneStart);
  const end = Number(job.metadata.sceneEnd);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return `${(end - start).toFixed(1)}s`;
  }
  if (job.metadata.extendedDurationTarget) return `${job.metadata.extendedDurationTarget}s target`;
  return '-';
};

const downloadJobDebugEvents = (job: GenerationJob, events: BridgeDebugEvent[]) => {
  const payload = {
    exportedAt: new Date().toISOString(),
    job,
    events,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${job.id}-flight-recorder.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const BrowserBridgeMonitor = ({ onClose }: BrowserBridgeMonitorProps) => {
  const [workers, setWorkers] = React.useState<BridgeWorkerSnapshot[]>([]);
  const [debugEvents, setDebugEvents] = React.useState<BridgeDebugEvent[]>([]);
  const [adapterTests, setAdapterTests] = React.useState<BridgeAdapterTestRecord[]>([]);
  const [queueJobs, setQueueJobs] = React.useState<GenerationJob[]>([]);
  const [activeTab, setActiveTab] = React.useState<MonitorTab>('active');
  const [queueStatusFilter, setQueueStatusFilter] = React.useState<QueueStatusFilter>('all');
  const [queueFlowFilter, setQueueFlowFilter] = React.useState<QueueFlowFilter>('all');
  const [queueProviderFilter, setQueueProviderFilter] = React.useState<QueueProviderFilter>('all');
  const [queueWorkerFilter, setQueueWorkerFilter] = React.useState<string>('all');
  const [queueProjectFilter, setQueueProjectFilter] = React.useState<string>('all');
  const [queueMediaFilter, setQueueMediaFilter] = React.useState<QueueMediaFilter>('all');
  const [workerNicknames, setWorkerNicknames] = React.useState<Record<string, string>>({});
  const [jobWorkerAssignments, setJobWorkerAssignments] = React.useState<Record<string, string>>({});
  const [manualMediaUrls, setManualMediaUrls] = React.useState<Record<string, string>>({});
  const [adapterTestPrompts, setAdapterTestPrompts] = React.useState<Record<string, string>>({});
  const [autoFallbackEnabled, setAutoFallbackEnabled] = React.useState(false);
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null);
  const [extendPrompts, setExtendPrompts] = React.useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [queueMessage, setQueueMessage] = React.useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = React.useState<string>('');

  const refresh = React.useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const [statusResponse, debugResponse, adapterTestResponse, queueResponse] = await Promise.all([
        getBrowserBridgeStatus(signal),
        listBrowserBridgeDebugEvents({ limit: 120, signal }),
        listBrowserBridgeAdapterTests({ limit: 100, signal }),
        listGenerationJobs({ signal }),
      ]);
      setWorkers(statusResponse.workers);
      setDebugEvents(debugResponse.events);
      setAdapterTests(adapterTestResponse.tests);
      setQueueJobs(queueResponse.jobs);
      setLastRefresh(new Date().toLocaleTimeString());
      if (autoFallbackEnabled) {
        const fallbackCandidate = queueResponse.jobs.find(job =>
          canRetryQueueJob(job)
          && !job.metadata.autoFallbackQueuedAt
          && bridgeProviders.some(provider =>
            provider !== job.provider && providerCanRunWithWorkers(statusResponse.workers, provider, job.mediaType)
          )
        );
        const fallbackProvider = fallbackCandidate
          ? bridgeProviders.find(provider =>
            provider !== fallbackCandidate.provider
            && providerCanRunWithWorkers(statusResponse.workers, provider, fallbackCandidate.mediaType)
          )
          : null;
        if (fallbackCandidate && fallbackProvider) {
          await fallbackGenerationJob(fallbackCandidate.id, fallbackProvider, {
            autoFallbackQueuedAt: new Date().toISOString(),
          });
          setQueueMessage(`Auto fallback queued ${fallbackCandidate.id} with ${fallbackProvider}.`);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Could not load bridge monitor data');
    } finally {
      setIsLoading(false);
    }
  }, [autoFallbackEnabled]);

  const applyWorkers = React.useCallback((nextWorkers: BridgeWorkerSnapshot[]) => {
    setWorkers(nextWorkers);
    setLastRefresh(new Date().toLocaleTimeString());
  }, []);

  const runWorkerAction = React.useCallback(async (
    actionKey: string,
    action: () => Promise<{ workers: BridgeWorkerSnapshot[] }>
  ) => {
    setActionId(actionKey);
    setError(null);
    try {
      const response = await action();
      applyWorkers(response.workers);
      const [debugResponse, adapterTestResponse] = await Promise.all([
        listBrowserBridgeDebugEvents({ limit: 120 }),
        listBrowserBridgeAdapterTests({ limit: 100 }),
      ]);
      setDebugEvents(debugResponse.events);
      setAdapterTests(adapterTestResponse.tests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bridge worker action failed');
    } finally {
      setActionId(null);
    }
  }, [applyWorkers]);

  const runQueueAction = React.useCallback(async (
    actionKey: string,
    action: () => Promise<string>
  ) => {
    setActionId(actionKey);
    setError(null);
    setQueueMessage(null);
    try {
      const message = await action();
      setQueueMessage(message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Queue action failed');
    } finally {
      setActionId(null);
    }
  }, [refresh]);

  React.useEffect(() => {
    const controller = new AbortController();
    const initialRefresh = window.setTimeout(() => void refresh(controller.signal), 0);
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => {
      controller.abort();
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const activeWorkers = workers.filter(isWorkerConnectedNow);
  const disconnectedWorkers = workers.filter(worker => !isWorkerConnectedNow(worker));
  const visibleWorkers = activeTab === 'active' ? activeWorkers : disconnectedWorkers;
  const connectedProfileLabels = activeWorkers.map(workerDisplayName);
  const eventsByWorker = React.useMemo(() => {
    const grouped = new Map<string, BridgeDebugEvent[]>();
    debugEvents.forEach(event => {
      const events = grouped.get(event.workerId) ?? [];
      events.push(event);
      grouped.set(event.workerId, events);
    });
    return grouped;
  }, [debugEvents]);
  const eventsByJob = React.useMemo(() => {
    const grouped = new Map<string, BridgeDebugEvent[]>();
    debugEvents.forEach(event => {
      if (!event.jobId) return;
      const events = grouped.get(event.jobId) ?? [];
      events.push(event);
      grouped.set(event.jobId, events);
    });
    return grouped;
  }, [debugEvents]);
  const adapterTestsByWorker = React.useMemo(() => {
    const grouped = new Map<string, BridgeAdapterTestRecord[]>();
    adapterTests.forEach(test => {
      const tests = grouped.get(test.workerId) ?? [];
      tests.push(test);
      grouped.set(test.workerId, tests);
    });
    return grouped;
  }, [adapterTests]);
  const queueCounts = React.useMemo(() => {
    const counts = queueJobs.reduce<Record<GenerationJobStatus, number>>((accumulator, job) => {
      accumulator[job.status] += 1;
      return accumulator;
    }, {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      manual_action_required: 0,
      canceled: 0,
    });
    return {
      ...counts,
      active: counts.running,
      trouble: counts.failed + counts.manual_action_required + counts.canceled,
      cooldown: workers.filter(worker => worker.status === 'cooldown').length,
      stale: workers.filter(worker => worker.status === 'stale').length,
    };
  }, [queueJobs, workers]);
  const projectOptions = React.useMemo(() => {
    const projects = new Map<string, string>();
    queueJobs.forEach(job => {
      if (!job.projectId) return;
      projects.set(job.projectId, queueProjectLabel(job));
    });
    return [...projects.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [queueJobs]);
  const workerOptions = React.useMemo(() => {
    const workerIds = new Set<string>();
    queueJobs.forEach(job => {
      const workerId = queueWorkerId(job);
      if (workerId) workerIds.add(workerId);
    });
    workers.forEach(worker => workerIds.add(worker.workerId));
    return [...workerIds].sort();
  }, [queueJobs, workers]);
  const filteredQueueJobs = React.useMemo(() => queueJobs
    .filter(job => queueStatusFilter === 'all' || job.status === queueStatusFilter)
    .filter(job => queueFlowFilter === 'all' || queueFlow(job) === queueFlowFilter)
    .filter(job => queueProviderFilter === 'all' || job.provider === queueProviderFilter)
    .filter(job => queueWorkerFilter === 'all' || queueWorkerId(job) === queueWorkerFilter)
    .filter(job => queueProjectFilter === 'all' || job.projectId === queueProjectFilter)
    .filter(job => queueMediaFilter === 'all' || job.mediaType === queueMediaFilter)
    .slice()
    .reverse(), [
      queueJobs,
      queueFlowFilter,
      queueMediaFilter,
      queueProjectFilter,
      queueProviderFilter,
      queueStatusFilter,
      queueWorkerFilter,
    ]);
  const filteredDebugEvents = React.useMemo(() => debugEvents
    .filter(event => queueProviderFilter === 'all' || event.provider === queueProviderFilter)
    .filter(event => queueWorkerFilter === 'all' || event.workerId === queueWorkerFilter)
    .filter(event => {
      if (!event.jobId) return queueProjectFilter === 'all' && queueStatusFilter === 'all' && queueMediaFilter === 'all' && queueFlowFilter === 'all';
      const job = queueJobs.find(candidate => candidate.id === event.jobId);
      if (!job) return true;
      return (queueProjectFilter === 'all' || job.projectId === queueProjectFilter)
        && (queueStatusFilter === 'all' || job.status === queueStatusFilter)
        && (queueMediaFilter === 'all' || job.mediaType === queueMediaFilter)
        && (queueFlowFilter === 'all' || queueFlow(job) === queueFlowFilter);
    })
    .slice(-60)
    .reverse(), [
      debugEvents,
      queueFlowFilter,
      queueJobs,
      queueMediaFilter,
      queueProjectFilter,
      queueProviderFilter,
      queueStatusFilter,
      queueWorkerFilter,
    ]);
  const selectedJob = React.useMemo(
    () => queueJobs.find(job => job.id === selectedJobId) ?? filteredQueueJobs[0] ?? null,
    [filteredQueueJobs, queueJobs, selectedJobId]
  );
  const selectedJobEvents = selectedJob ? eventsByJob.get(selectedJob.id) ?? [] : [];
  const selectedWorker = selectedJob
    ? workers.find(worker => worker.workerId === queueWorkerId(selectedJob))
    : null;
  const selectedJobAssignedWorkerId = selectedJob ? queueAssignedWorkerId(selectedJob) : '';
  const selectedJobAssignmentDraft = selectedJob
    ? jobWorkerAssignments[selectedJob.id] ?? selectedJobAssignedWorkerId
    : '';
  const selectedJobManualMediaUrl = selectedJob ? manualMediaUrls[selectedJob.id] ?? '' : '';
  const shortsShots = React.useMemo(() => {
    const extendJobsBySource = new Map<string, GenerationJob[]>();
    queueJobs.forEach(job => {
      if (!isExtendVideoJob(job) || !job.metadata.sourceJobId) return;
      const children = extendJobsBySource.get(job.metadata.sourceJobId) ?? [];
      children.push(job);
      extendJobsBySource.set(job.metadata.sourceJobId, children);
    });
    return queueJobs
      .filter(job => job.mediaType === 'video' && !isExtendVideoJob(job) && (job.resultUrl || extendJobsBySource.has(job.id)))
      .map(baseJob => {
        const extendJobs = (extendJobsBySource.get(baseJob.id) ?? []).slice().reverse();
        const completedExtend = extendJobs.find(job => job.status === 'completed' && Boolean(job.resultUrl || job.metadata.selectedVariantUrl));
        const selectedFinalId = baseJob.metadata.shortsFinalJobId || completedExtend?.id || baseJob.id;
        const finalJob = selectedFinalId === baseJob.id
          ? baseJob
          : extendJobs.find(job => job.id === selectedFinalId) ?? extendJobs[0] ?? baseJob;
        return { baseJob, extendJobs, completedExtend, finalJob };
      })
      .slice(0, 12);
  }, [queueJobs]);
  const providerCanRunJob = (
    provider: ProviderName,
    mediaType: GeneratedMediaType,
    requireExtend = false
  ) => providerCanRunWithWorkers(activeWorkers, provider, mediaType, requireExtend);
  const queueClearFilters = React.useMemo(() => ({
    provider: queueProviderFilter === 'all' ? null : queueProviderFilter,
    workerId: queueWorkerFilter === 'all' ? null : queueWorkerFilter,
    projectId: queueProjectFilter === 'all' ? null : queueProjectFilter,
    flow: queueFlowFilter === 'all' ? null : queueFlowFilter,
    mediaType: queueMediaFilter === 'all' ? null : queueMediaFilter,
  }), [queueFlowFilter, queueMediaFilter, queueProjectFilter, queueProviderFilter, queueWorkerFilter]);

  return (
    <div className="bridge-monitor-shell" role="dialog" aria-modal="true" aria-label="Browser Bridge Monitor">
      <div className="bridge-monitor">
        <header className="bridge-monitor-header">
          <div>
            <h2>Browser Bridge Monitor</h2>
            <p>{workers.length} worker{workers.length === 1 ? '' : 's'} connected or recently seen</p>
          </div>
          <div className="bridge-monitor-actions">
            <button className="btn-secondary" onClick={() => void refresh()} disabled={isLoading}>
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
            {activeTab === 'disconnected' && (
              <button
                className="btn-secondary"
                onClick={() => void runWorkerAction('clear-disconnected', () => clearDisconnectedBridgeWorkers())}
                disabled={actionId === 'clear-disconnected' || disconnectedWorkers.length === 0}
              >
                {actionId === 'clear-disconnected' ? 'Clearing...' : 'Clear Disconnected'}
              </button>
            )}
            <button className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        </header>

        <div className="bridge-monitor-summary">
          <div>
            <span>Last refresh</span>
            <strong>{lastRefresh || '-'}</strong>
          </div>
          <div>
            <span>Currently connected</span>
            <strong>{activeWorkers.length}</strong>
          </div>
          <div>
            <span>Disconnected</span>
            <strong>{disconnectedWorkers.length}</strong>
          </div>
        </div>

        <div className="bridge-connected-strip">
          <span>Connected profiles</span>
          <strong>{connectedProfileLabels.length ? connectedProfileLabels.join(', ') : '-'}</strong>
        </div>

        <div className="bridge-monitor-tabs" role="tablist" aria-label="Bridge worker groups">
          <button
            role="tab"
            aria-selected={activeTab === 'active'}
            className={activeTab === 'active' ? 'active' : ''}
            onClick={() => setActiveTab('active')}
          >
            Active Profiles <span>{activeWorkers.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'disconnected'}
            className={activeTab === 'disconnected' ? 'active' : ''}
            onClick={() => setActiveTab('disconnected')}
          >
            Disconnected <span>{disconnectedWorkers.length}</span>
          </button>
        </div>

        {error && <div className="bridge-monitor-error">{error}</div>}
        {queueMessage && <div className="bridge-monitor-note">{queueMessage}</div>}

        <section className="bridge-queue-panel" aria-label="Generation Queue Dashboard">
          <div className="bridge-queue-header">
            <div>
              <h3>Queue Dashboard</h3>
              <p>{filteredQueueJobs.length} visible of {queueJobs.length} job{queueJobs.length === 1 ? '' : 's'}</p>
            </div>
            <div className="bridge-queue-actions">
              <button className="btn-secondary" onClick={() => void refresh()} disabled={isLoading}>
                Refresh Queue
              </button>
              <button
                className="btn-secondary"
                onClick={() => void runQueueAction('retry-visible-failed', async () => {
                  const retryable = filteredQueueJobs.filter(canRetryQueueJob);
                  await Promise.all(retryable.map(job => retryGenerationJob(job.id)));
                  return `Retried ${retryable.length} failed job${retryable.length === 1 ? '' : 's'}.`;
                })}
                disabled={actionId === 'retry-visible-failed' || filteredQueueJobs.filter(canRetryQueueJob).length === 0}
              >
                Retry Failed
              </button>
              <button
                className="btn-secondary"
                onClick={() => void runQueueAction('clear-completed', async () => {
                  const result = await clearGenerationJobHistory({
                    ...queueClearFilters,
                    statuses: ['completed'],
                  });
                  return `Cleared ${result.cleared} completed job${result.cleared === 1 ? '' : 's'}.`;
                })}
                disabled={actionId === 'clear-completed' || queueCounts.completed === 0}
              >
                Clear Completed
              </button>
              <button
                className="btn-secondary danger"
                onClick={() => void runQueueAction('clear-failed', async () => {
                  const result = await clearGenerationJobHistory({
                    ...queueClearFilters,
                    statuses: failedQueueStatuses,
                  });
                  return `Cleared ${result.cleared} failed/manual/canceled job${result.cleared === 1 ? '' : 's'}.`;
                })}
                disabled={actionId === 'clear-failed' || queueCounts.trouble === 0}
              >
                Clear Failed
              </button>
              <button
                className="btn-secondary danger"
                onClick={() => void runQueueAction('clear-screenshots', async () => {
                  if (!window.confirm('Clear stored bridge debug screenshots?')) {
                    return 'Screenshot clear canceled.';
                  }
                  const result = await clearBrowserBridgeDebugScreenshots();
                  return `Cleared ${result.cleared} screenshot file${result.cleared === 1 ? '' : 's'}.`;
                })}
                disabled={actionId === 'clear-screenshots'}
              >
                Clear Screenshots
              </button>
              <label className="bridge-auto-fallback">
                <input
                  type="checkbox"
                  checked={autoFallbackEnabled}
                  onChange={event => setAutoFallbackEnabled(event.target.checked)}
                />
                Auto fallback
              </label>
            </div>
          </div>

          <div className="bridge-queue-counts">
            <span>Queued <strong>{queueCounts.queued}</strong></span>
            <span>Active <strong>{queueCounts.active}</strong></span>
            <span>Completed <strong>{queueCounts.completed}</strong></span>
            <span>Failed <strong>{queueCounts.trouble}</strong></span>
            <span>Stale <strong>{queueCounts.stale}</strong></span>
            <span>Cooldown <strong>{queueCounts.cooldown}</strong></span>
          </div>

          <div className="bridge-queue-filters">
            <label>
              Workflow
              <select value={queueFlowFilter} onChange={event => setQueueFlowFilter(event.target.value as QueueFlowFilter)}>
                <option value="all">All workflows</option>
                <option value="auto_generate">Auto Generate</option>
                <option value="auto_animate">Auto Animate</option>
              </select>
            </label>
            <label>
              Status
              <select value={queueStatusFilter} onChange={event => setQueueStatusFilter(event.target.value as QueueStatusFilter)}>
                <option value="all">All statuses</option>
                {queueStatuses.map(status => (
                  <option key={status} value={status}>{queueStatusLabel(status)}</option>
                ))}
              </select>
            </label>
            <label>
              Provider
              <select value={queueProviderFilter} onChange={event => setQueueProviderFilter(event.target.value as QueueProviderFilter)}>
                <option value="all">All providers</option>
                <option value="meta">Meta</option>
                <option value="grok">Grok</option>
              </select>
            </label>
            <label>
              Worker
              <select value={queueWorkerFilter} onChange={event => setQueueWorkerFilter(event.target.value)}>
                <option value="all">All workers</option>
                {workerOptions.map(workerId => {
                  const worker = workers.find(candidate => candidate.workerId === workerId);
                  return (
                    <option key={workerId} value={workerId}>
                      {worker ? workerDisplayName(worker) : shortWorkerId(workerId)}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              Project
              <select value={queueProjectFilter} onChange={event => setQueueProjectFilter(event.target.value)}>
                <option value="all">All projects</option>
                {projectOptions.map(([projectId, label]) => (
                  <option key={projectId} value={projectId}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              Job Type
              <select value={queueMediaFilter} onChange={event => setQueueMediaFilter(event.target.value as QueueMediaFilter)}>
                <option value="all">All media</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </label>
          </div>

          <div className="bridge-queue-secondary-actions">
            <button
              className="btn-secondary"
              onClick={() => void runQueueAction('clear-project-finished', async () => {
                const projectId = queueProjectFilter !== 'all' ? queueProjectFilter : selectedJob?.projectId ?? null;
                if (!projectId) return 'Choose a project or select a project job first.';
                const result = await clearGenerationJobHistory({
                  ...queueClearFilters,
                  projectId,
                  statuses: finishedQueueStatuses,
                });
                return `Cleared ${result.cleared} finished job${result.cleared === 1 ? '' : 's'} for ${projectId}.`;
              })}
              disabled={actionId === 'clear-project-finished' || (!selectedJob?.projectId && queueProjectFilter === 'all')}
            >
              Clear Project Finished
            </button>
            <button
              className="btn-secondary danger"
              onClick={() => void runQueueAction('clear-project-all', async () => {
                const projectId = queueProjectFilter !== 'all' ? queueProjectFilter : selectedJob?.projectId ?? null;
                if (!projectId) return 'Choose a project or select a project job first.';
                if (!window.confirm(`Clear queued, running, completed, and failed jobs for ${projectId}?`)) {
                  return 'Project clear canceled.';
                }
                const result = await clearGenerationJobHistory({
                  ...queueClearFilters,
                  projectId,
                  includeActive: true,
                });
                return `Cleared ${result.cleared} total job${result.cleared === 1 ? '' : 's'} for ${projectId}.`;
              })}
              disabled={actionId === 'clear-project-all' || (!selectedJob?.projectId && queueProjectFilter === 'all')}
            >
              Clear Project All
            </button>
            <button
              className="btn-secondary"
              onClick={() => void runQueueAction('clear-worker-finished', async () => {
                if (queueWorkerFilter === 'all') return 'Choose a worker first.';
                const result = await clearGenerationJobHistory({
                  ...queueClearFilters,
                  workerId: queueWorkerFilter,
                  statuses: finishedQueueStatuses,
                });
                return `Cleared ${result.cleared} finished worker job${result.cleared === 1 ? '' : 's'}.`;
              })}
              disabled={actionId === 'clear-worker-finished' || queueWorkerFilter === 'all'}
            >
              Clear Worker Finished
            </button>
            <button
              className="btn-secondary danger"
              onClick={() => void runQueueAction('clear-worker-all', async () => {
                if (queueWorkerFilter === 'all') return 'Choose a worker first.';
                if (!window.confirm(`Clear queued, running, completed, and failed jobs for ${shortWorkerId(queueWorkerFilter)}?`)) {
                  return 'Worker clear canceled.';
                }
                const result = await clearGenerationJobHistory({
                  ...queueClearFilters,
                  workerId: queueWorkerFilter,
                  includeActive: true,
                });
                return `Cleared ${result.cleared} total worker job${result.cleared === 1 ? '' : 's'}.`;
              })}
              disabled={actionId === 'clear-worker-all' || queueWorkerFilter === 'all'}
            >
              Clear Worker All
            </button>
            <button
              className="btn-secondary"
              onClick={() => selectedJob && void runQueueAction(`pause-batch-${selectedJob.batchId}`, async () => {
                await pauseGenerationBatch(selectedJob.batchId, selectedJob.projectId);
                return `Paused batch ${selectedJob.batchId}.`;
              })}
              disabled={!selectedJob || actionId === `pause-batch-${selectedJob?.batchId}`}
            >
              Pause Selected Batch
            </button>
            <button
              className="btn-secondary"
              onClick={() => selectedJob && void runQueueAction(`resume-batch-${selectedJob.batchId}`, async () => {
                await resumeGenerationBatch(selectedJob.batchId, selectedJob.projectId);
                return `Resumed batch ${selectedJob.batchId}.`;
              })}
              disabled={!selectedJob || actionId === `resume-batch-${selectedJob?.batchId}`}
            >
              Resume Selected Batch
            </button>
          </div>

          {shortsShots.length > 0 && (
            <section className="bridge-shorts-panel" aria-label="Shorts Shot Builder">
              <div className="bridge-shorts-header">
                <div>
                  <h4>Shorts Shot Builder</h4>
                  <p>Base and extended clips for quick final-shot selection.</p>
                </div>
              </div>
              <div className="bridge-shorts-list">
                {shortsShots.map(({ baseJob, extendJobs, completedExtend, finalJob }) => {
                  const latestExtend = extendJobs[0] ?? null;
                  const finalIsBase = finalJob.id === baseJob.id;
                  const baseHasResult = Boolean(baseJob.resultUrl || baseJob.metadata.selectedVariantUrl);
                  return (
                    <div key={baseJob.id} className="bridge-shorts-row">
                      <button type="button" onClick={() => setSelectedJobId(baseJob.id)}>
                        <strong>{queueSubject(baseJob)}</strong>
                        <span>Base: {baseJob.status} · {jobDurationLabel(baseJob)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => latestExtend && setSelectedJobId(latestExtend.id)}
                        disabled={!latestExtend}
                      >
                        <strong>{latestExtend ? queueSubject(latestExtend) : 'No extend yet'}</strong>
                        <span>Extended: {latestExtend ? `${latestExtend.status} · ${jobDurationLabel(latestExtend)}` : 'not queued'}</span>
                      </button>
                      <div className="bridge-shorts-final">
                        <span>Final: {finalIsBase ? 'base' : 'extended'} · {finalJob.status}</span>
                        <div>
                          <button
                            className={finalIsBase ? 'selected' : ''}
                            type="button"
                            onClick={() => void runQueueAction(`shorts-final-base-${baseJob.id}`, async () => {
                              await selectShortsFinalClip(baseJob.id, baseJob.id);
                              return `Selected base clip as final for ${baseJob.id}.`;
                            })}
                            disabled={!baseHasResult || baseJob.status !== 'completed' || actionId === `shorts-final-base-${baseJob.id}`}
                          >
                            Use Base
                          </button>
                          <button
                            className={!finalIsBase ? 'selected' : ''}
                            type="button"
                            onClick={() => completedExtend && void runQueueAction(`shorts-final-extend-${baseJob.id}`, async () => {
                              await selectShortsFinalClip(baseJob.id, completedExtend.id);
                              return `Selected extended clip as final for ${baseJob.id}.`;
                            })}
                            disabled={!completedExtend || actionId === `shorts-final-extend-${baseJob.id}`}
                          >
                            Use Extended
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="bridge-queue-body">
            <div className="bridge-queue-list">
              {filteredQueueJobs.length === 0 && (
                <div className="bridge-queue-empty">No jobs match the current filters.</div>
              )}
              {filteredQueueJobs.slice(0, 80).map(job => {
                const workerId = queueWorkerId(job);
                const worker = workers.find(candidate => candidate.workerId === workerId);
                return (
                  <button
                    type="button"
                    key={job.id}
                    className={`bridge-queue-row status-${job.status} ${selectedJob?.id === job.id ? 'selected' : ''}`}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <span className={`queue-status-pill status-${job.status}`}>{queueStatusLabel(job.status)}</span>
                    <strong>{queueSubject(job)}</strong>
                    <small>{queueFlowLabel(job)} · {job.provider} · {jobTypeLabel(job)} · {queueProjectLabel(job)}</small>
                    <small>{worker ? workerDisplayName(worker) : workerId || 'No worker yet'} · {queueResultLabel(job)}</small>
                    {job.error && <em>{job.error}</em>}
                  </button>
                );
              })}
            </div>

            {selectedJob && (
              <aside className="bridge-job-detail" aria-label="Selected job detail">
                <div className="bridge-job-detail-header">
                  <div>
                    <h4>{queueSubject(selectedJob)}</h4>
                    <p>{selectedJob.id} · {selectedJob.batchId}</p>
                  </div>
                  <span className={`queue-status-pill status-${selectedJob.status}`}>{queueStatusLabel(selectedJob.status)}</span>
                </div>
                <div className="bridge-job-detail-actions">
                  <button
                    className="btn-secondary"
                    onClick={() => void runQueueAction(`retry-${selectedJob.id}`, async () => {
                      await retryGenerationJob(selectedJob.id);
                      return `Retried ${selectedJob.id}.`;
                    })}
                    disabled={!canRetryQueueJob(selectedJob) || actionId === `retry-${selectedJob.id}`}
                  >
                    Retry Selected
                  </button>
                  {bridgeProviders.filter(provider => provider !== selectedJob.provider).map(provider => {
                    const canFallback = canRetryQueueJob(selectedJob) && providerCanRunJob(provider, selectedJob.mediaType);
                    return (
                      <button
                        key={provider}
                        className="btn-secondary"
                        onClick={() => void runQueueAction(`fallback-${selectedJob.id}-${provider}`, async () => {
                          await fallbackGenerationJob(selectedJob.id, provider);
                          return `Queued ${selectedJob.id} with ${provider} fallback.`;
                        })}
                        disabled={!canFallback || actionId === `fallback-${selectedJob.id}-${provider}`}
                        title={canFallback ? `Retry with ${provider}` : `${provider} has no active capable worker`}
                      >
                        Fallback {provider}
                      </button>
                    );
                  })}
                  {selectedJob.status === 'completed' && selectedJob.mediaType === 'video' && selectedJob.resultUrl && (
                    <button
                      className="btn-secondary"
                      onClick={() => void runQueueAction(`extend-${selectedJob.id}`, async () => {
                        const extendProvider = selectedJob.provider === 'meta' ? 'meta' : 'meta';
                        await createExtendVideoJob(
                          selectedJob.id,
                          extendProvider,
                          extendPrompts[selectedJob.id] || ''
                        );
                        return `Queued Meta Extend Video child job for ${selectedJob.id}.`;
                      })}
                      disabled={!providerCanRunJob('meta', 'video', true) || actionId === `extend-${selectedJob.id}`}
                      title={providerCanRunJob('meta', 'video', true)
                        ? 'Create an Extend Video child job'
                        : 'No active Meta worker currently reports Extend Video support'}
                    >
                      Extend Video
                    </button>
                  )}
                  {selectedJob.resultUrl && (
                    <a href={resolveBackendMediaUrl(selectedJob.resultUrl)} target="_blank" rel="noreferrer">
                      Open Result
                    </a>
                  )}
                  <button
                    className="btn-secondary"
                    onClick={() => downloadJobDebugEvents(selectedJob, selectedJobEvents)}
                    disabled={selectedJobEvents.length === 0}
                  >
                    Download Debug
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => void runQueueAction(`regenerate-variant-${selectedJob.id}`, async () => {
                      await regenerateGenerationJobVariant(selectedJob.id, selectedJob.resultUrl);
                      return `Queued a separate variant regeneration for ${selectedJob.id}.`;
                    })}
                    disabled={!selectedJob.resultUrl || actionId === `regenerate-variant-${selectedJob.id}`}
                  >
                    Regen Variant
                  </button>
                </div>
                <label className="bridge-job-assignment">
                  Assign Worker
                  <div>
                    <select
                      value={selectedJobAssignmentDraft}
                      onChange={event => setJobWorkerAssignments(previous => ({
                        ...previous,
                        [selectedJob.id]: event.target.value,
                      }))}
                    >
                      <option value="">Auto route</option>
                      {workers.map(worker => (
                        <option key={worker.workerId} value={worker.workerId}>
                          {workerDisplayName(worker)}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn-secondary"
                      onClick={() => void runQueueAction(`assign-worker-${selectedJob.id}`, async () => {
                        const workerId = selectedJobAssignmentDraft || null;
                        await assignGenerationJobWorker(selectedJob.id, workerId);
                        return workerId
                          ? `Assigned ${selectedJob.id} to ${workerId}.`
                          : `Cleared worker assignment for ${selectedJob.id}.`;
                      })}
                      disabled={selectedJobAssignmentDraft === selectedJobAssignedWorkerId || actionId === `assign-worker-${selectedJob.id}`}
                    >
                      Apply
                    </button>
                  </div>
                </label>
                <label className="bridge-job-assignment">
                  Manual Media URL
                  <div>
                    <input
                      value={selectedJobManualMediaUrl}
                      onChange={event => setManualMediaUrls(previous => ({
                        ...previous,
                        [selectedJob.id]: event.target.value,
                      }))}
                      placeholder="Paste generated image or video URL"
                    />
                    <button
                      className="btn-secondary"
                      onClick={() => void runQueueAction(`manual-import-${selectedJob.id}`, async () => {
                        const mediaUrl = selectedJobManualMediaUrl.trim();
                        await storeRemoteGenerationJob(selectedJob.id, mediaUrl);
                        setManualMediaUrls(previous => ({
                          ...previous,
                          [selectedJob.id]: '',
                        }));
                        return `Imported manual media for ${selectedJob.id}.`;
                      })}
                      disabled={!selectedJobManualMediaUrl.trim() || actionId === `manual-import-${selectedJob.id}`}
                    >
                      Import
                    </button>
                  </div>
                </label>
                {selectedJob.status === 'completed' && selectedJob.mediaType === 'video' && selectedJob.resultUrl && (
                  <label className="bridge-job-extend-prompt">
                    Continuation Prompt
                    <input
                      type="text"
                      value={extendPrompts[selectedJob.id] || ''}
                      onChange={event => setExtendPrompts(previous => ({
                        ...previous,
                        [selectedJob.id]: event.target.value,
                      }))}
                      placeholder="Optional note for Meta Extend"
                    />
                  </label>
                )}
                <div className="bridge-job-detail-grid">
                  <div><span>Workflow</span><strong>{queueFlowLabel(selectedJob)}</strong></div>
                  <div><span>Provider</span><strong>{selectedJob.provider}</strong></div>
                  <div><span>Project</span><strong>{queueProjectLabel(selectedJob)}</strong></div>
                  <div><span>Worker</span><strong>{selectedWorker ? workerDisplayName(selectedWorker) : queueWorkerId(selectedJob) || '-'}</strong></div>
                  <div><span>Assigned</span><strong>{selectedJobAssignedWorkerId ? workerLabelById(workers, selectedJobAssignedWorkerId) : 'Auto route'}</strong></div>
                  <div><span>Result</span><strong>{queueResultLabel(selectedJob)}</strong></div>
                  <div><span>Attempt</span><strong>{selectedJob.metadata.runAttempt || '-'}</strong></div>
                  <div><span>Job Type</span><strong>{jobTypeLabel(selectedJob)}</strong></div>
                  <div><span>Fallback</span><strong>{selectedJob.metadata.fallbackHistory || '-'}</strong></div>
                </div>
                {selectedJob.error && <div className="bridge-worker-error">{selectedJob.error}</div>}
                <div className="bridge-job-prompt">
                  <span>Prompt</span>
                  <p>{selectedJob.prompt || '-'}</p>
                  {selectedJob.negativePrompt && (
                    <>
                      <span>Negative</span>
                      <p>{selectedJob.negativePrompt}</p>
                    </>
                  )}
                </div>
                {selectedJob.resultVariants.length > 0 && (
                  <div className="bridge-job-variant-grid">
                    {selectedJob.resultVariants.slice(0, 4).map((variant, index) => (
                      <button
                        type="button"
                        key={`${variant.url}-${index}`}
                        className={`bridge-job-variant ${selectedJob.resultUrl === variant.url ? 'selected' : ''}`}
                        onClick={() => void runQueueAction(`select-variant-${selectedJob.id}-${index}`, async () => {
                          await selectGenerationJobVariant(selectedJob.id, variant.url);
                          return `Selected variant ${index + 1} for ${selectedJob.id}.`;
                        })}
                        disabled={actionId === `select-variant-${selectedJob.id}-${index}` || selectedJob.resultUrl === variant.url}
                      >
                        {variant.mediaType === 'video' ? (
                          <video
                            src={resolveBackendMediaUrl(variant.url)}
                            muted
                            loop
                            playsInline
                            preload="metadata"
                            onMouseEnter={event => void event.currentTarget.play().catch(() => {})}
                            onMouseLeave={event => event.currentTarget.pause()}
                          />
                        ) : (
                          <img src={resolveBackendMediaUrl(variant.url)} alt={`Variant ${index + 1}`} />
                        )}
                        <span>{selectedJob.resultUrl === variant.url ? 'Selected' : `Use ${index + 1}`}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="bridge-debug-list">
                  <div className="bridge-debug-title">Flight Recorder</div>
                  {selectedJobEvents.length === 0 && <div className="bridge-debug-empty">No debug events for this job yet.</div>}
                  {selectedJobEvents.slice(-8).reverse().map(event => {
                    const screenshotUrl = event.metadata.screenshotUrl;
                    return (
                      <div key={event.id} className={`bridge-debug-event level-${event.level}`}>
                        <strong>{event.step.replaceAll('_', ' ')}</strong>
                        <span>{event.message}</span>
                      <small>{eventTime(event)} · {eventElapsedLabel(selectedJobEvents, event)}{event.provider ? ` · ${event.provider}` : ''}</small>
                        {screenshotUrl && (
                          <a href={resolveBackendMediaUrl(screenshotUrl)} target="_blank" rel="noreferrer">
                            View screenshot
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </aside>
            )}
          </div>
        </section>

        <section className="bridge-live-debug-panel" aria-label="Live Provider Debug Panel">
          <div className="bridge-live-debug-header">
            <div>
              <h3>Live Provider Debug</h3>
              <p>{filteredDebugEvents.length} events using the queue filters above</p>
            </div>
            <button className="btn-secondary" onClick={() => void refresh()} disabled={isLoading}>
              Refresh Debug
            </button>
          </div>
          <div className="bridge-live-debug-list">
            {filteredDebugEvents.length === 0 && (
              <div className="bridge-debug-empty">No provider debug events match the current filters.</div>
            )}
            {filteredDebugEvents.map(event => {
              const eventJob = event.jobId ? queueJobs.find(job => job.id === event.jobId) : null;
              const screenshotUrl = event.metadata.screenshotUrl;
              return (
                <button
                  type="button"
                  key={event.id}
                  className={`bridge-live-debug-row level-${event.level}`}
                  onClick={() => event.jobId && setSelectedJobId(event.jobId)}
                >
                  <span>{eventTime(event)}</span>
                  <strong>{event.step.replaceAll('_', ' ')}</strong>
                  <small>
                    {event.provider || '-'} · {workerLabelById(workers, event.workerId)}
                    {eventJob ? ` · ${queueSubject(eventJob)} · ${eventJob.status}` : ''}
                  </small>
                  <em>{event.message}</em>
                  {screenshotUrl && (
                    <a href={resolveBackendMediaUrl(screenshotUrl)} target="_blank" rel="noreferrer">
                      screenshot
                    </a>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <div className="bridge-worker-list">
          {visibleWorkers.length === 0 && !error && (
            <div className="bridge-worker-empty">
              {activeTab === 'active'
                ? 'No active extension profiles right now. Open the NeuralScribe Bridge side panel in Chrome and connect.'
                : 'No disconnected extension profiles yet.'}
            </div>
          )}

          {visibleWorkers.map(worker => {
            const connectedNow = isWorkerConnectedNow(worker);
            const nicknameDraft = workerNicknames[worker.workerId] ?? worker.nickname ?? '';
            const adapterPromptDraft = adapterTestPrompts[worker.workerId] ?? '';
            const workerAdapterTests = adapterTestsByWorker.get(worker.workerId) ?? [];
            return (
            <article key={worker.workerId} className={`bridge-worker-card status-${worker.status}`}>
              <div className="bridge-worker-topline">
                <div>
                  <h3>{workerDisplayName(worker)}</h3>
                  <p>{worker.profileEmail || 'No detected profile email'} · {worker.workerId}</p>
                </div>
                <div className="bridge-worker-pills">
                  <span className={`bridge-status-pill ${connectedNow ? 'connected-now' : 'disconnected-now'}`}>
                    {connectedNow ? 'Currently connected' : 'Disconnected'}
                  </span>
                  <span className={`bridge-status-pill status-${worker.status}`}>{statusLabel(worker.status)}</span>
                </div>
              </div>

              <label className="bridge-worker-nickname">
                <span>Nickname</span>
                <div>
                  <input
                    value={nicknameDraft}
                    onChange={event => setWorkerNicknames(previous => ({
                      ...previous,
                      [worker.workerId]: event.target.value,
                    }))}
                    placeholder={worker.chromeProfileLabel || worker.profileEmail || shortWorkerId(worker.workerId)}
                  />
                  <button
                    className="btn-secondary"
                    onClick={() => void runWorkerAction(`nickname-${worker.workerId}`, () =>
                      updateBrowserBridgeWorkerNickname(worker.workerId, nicknameDraft)
                    )}
                    disabled={nicknameDraft.trim() === (worker.nickname || '').trim() || actionId === `nickname-${worker.workerId}`}
                  >
                    Save
                  </button>
                </div>
              </label>

              <div className="bridge-worker-grid">
                <div>
                  <span>Chrome profile</span>
                  <strong>{worker.chromeProfileLabel || worker.profileEmail || 'Set in extension'}</strong>
                </div>
                <div>
                  <span>Account label</span>
                  <strong>{worker.accountLabel || worker.profileEmail || '-'}</strong>
                </div>
                <div>
                  <span>Providers</span>
                  <strong>{worker.providers.join(', ') || '-'}</strong>
                </div>
                <div>
                  <span>Extension</span>
                  <strong>{worker.extensionVersion || worker.version || '-'}</strong>
                </div>
                <div>
                  <span>Last seen</span>
                  <strong>{formatTime(worker.lastSeenAt)}</strong>
                </div>
                <div>
                  <span>Cooldown</span>
                  <strong>{formatCooldown(worker.cooldownUntil)}</strong>
                </div>
                <div>
                  <span>Current job</span>
                  <strong>{worker.currentJobId || '-'}</strong>
                </div>
                <div>
                  <span>Project</span>
                  <strong>{worker.currentProjectId || '-'}</strong>
                </div>
              </div>

              {worker.capabilities.length > 0 && (
                <div className="bridge-capability-list">
                  {worker.capabilities.map(capability => (
                    <span key={capability.provider}>{capabilityText(capability)}</span>
                  ))}
                </div>
              )}

              {worker.health.length > 0 && (
                <div className="bridge-health-list">
                  {worker.health.map(health => (
                    <div key={health.provider} className={`bridge-health-item status-${health.status}`}>
                      <strong>{healthLabel(health)}</strong>
                      <span>{health.message || 'No health message'}</span>
                      <small>
                        Prompt {health.canFindPrompt ? 'yes' : 'no'} · Generate {health.canFindGenerateButton ? 'yes' : 'no'} · Extend {health.canExtendVideo ? 'yes' : 'no'}
                      </small>
                    </div>
                  ))}
                </div>
              )}

              {worker.jobMessage && <div className="bridge-worker-note">{worker.jobMessage}</div>}
              {worker.lastError && <div className="bridge-worker-error">{worker.lastError}</div>}
              {worker.compatibility.status === 'version_mismatch' && (
                <div className="bridge-worker-error">
                  Extension protocol mismatch. Reload the unpacked extension so it matches protocol {worker.compatibility.supportedProtocolVersion}.
                </div>
              )}
              <label className="bridge-worker-adapter-test">
                <span>Full Test Prompt</span>
                <input
                  value={adapterPromptDraft}
                  onChange={event => setAdapterTestPrompts(previous => ({
                    ...previous,
                    [worker.workerId]: event.target.value,
                  }))}
                  placeholder="Optional prompt for user-confirmed full adapter test"
                />
              </label>
              <div className="bridge-worker-actions">
                {worker.paused ? (
                  <button
                    className="btn-secondary"
                    onClick={() => void runWorkerAction(`resume-${worker.workerId}`, () => resumeBrowserBridgeWorker(worker.workerId))}
                    disabled={actionId === `resume-${worker.workerId}`}
                  >
                    {actionId === `resume-${worker.workerId}` ? 'Resuming...' : 'Resume'}
                  </button>
                ) : (
                  <button
                    className="btn-secondary"
                    onClick={() => void runWorkerAction(`pause-${worker.workerId}`, () => pauseBrowserBridgeWorker(worker.workerId))}
                    disabled={!connectedNow || actionId === `pause-${worker.workerId}`}
                  >
                    {actionId === `pause-${worker.workerId}` ? 'Pausing...' : 'Pause'}
                  </button>
                )}
                <button
                  className="btn-secondary"
                  onClick={() => void runWorkerAction(`clear-error-${worker.workerId}`, () => clearBrowserBridgeWorkerError(worker.workerId))}
                  disabled={!worker.lastError || actionId === `clear-error-${worker.workerId}`}
                >
                  Clear Error
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    if (!window.confirm('Clear this provider cooldown and allow this profile to try again now?')) return;
                    void runWorkerAction(`clear-cooldown-${worker.workerId}`, () => clearBrowserBridgeWorkerCooldown(worker.workerId));
                  }}
                  disabled={!connectedNow || !worker.cooldownUntil || actionId === `clear-cooldown-${worker.workerId}`}
                >
                  Clear Cooldown
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => void runWorkerAction(`health-${worker.workerId}`, () => runBrowserBridgeHealthCheck(worker.workerId))}
                  disabled={!connectedNow || actionId === `health-${worker.workerId}`}
                >
                  {actionId === `health-${worker.workerId}` ? 'Checking...' : 'Health Check'}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => void runWorkerAction(`adapter-${worker.workerId}`, () => runBrowserBridgeAdapterTest(worker.workerId))}
                  disabled={!connectedNow || actionId === `adapter-${worker.workerId}`}
                >
                  {actionId === `adapter-${worker.workerId}` ? 'Testing...' : 'Test Meta'}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    if (!window.confirm('Run a full Meta adapter test? This submits the prompt in this Chrome profile.')) return;
                    void runWorkerAction(`adapter-full-${worker.workerId}`, () => runBrowserBridgeAdapterTest(worker.workerId, {
                      fullTestPrompt: adapterPromptDraft || 'NeuralScribe adapter test image, simple blue geometric logo, no text',
                      submitFullTest: true,
                    }));
                  }}
                  disabled={!connectedNow || actionId === `adapter-full-${worker.workerId}`}
                >
                  {actionId === `adapter-full-${worker.workerId}` ? 'Testing...' : 'Full Test'}
                </button>
              </div>

              {workerAdapterTests.length > 0 && (
                <div className="bridge-adapter-test-list">
                  <div className="bridge-debug-title">Adapter Tests</div>
                  {workerAdapterTests.slice(-4).reverse().map(test => (
                    <div key={test.id} className={`bridge-adapter-test-row status-${test.status}`}>
                      <strong>{test.mode} · {test.status}</strong>
                      <span>{test.message || 'No adapter test message'}</span>
                      <small>{formatTime(test.completedAt || test.createdAt)} · {test.provider}</small>
                      {test.resultUrl && (
                        <a href={resolveBackendMediaUrl(test.resultUrl)} target="_blank" rel="noreferrer">
                          Open result
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {(eventsByWorker.get(worker.workerId) ?? []).length > 0 && (
                <div className="bridge-debug-list">
                  <div className="bridge-debug-title">Recent Debug</div>
                  {(eventsByWorker.get(worker.workerId) ?? []).slice(-5).reverse().map(event => {
                    const screenshotUrl = event.metadata.screenshotUrl;
                    return (
                      <div key={event.id} className={`bridge-debug-event level-${event.level}`}>
                        <strong>{event.step.replaceAll('_', ' ')}</strong>
                        <span>{event.message}</span>
                        <small>{eventTime(event)}{event.jobId ? ` · ${event.jobId}` : ''}</small>
                        {screenshotUrl && (
                          <a href={resolveBackendMediaUrl(screenshotUrl)} target="_blank" rel="noreferrer">
                            View screenshot
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          )})}
        </div>
      </div>
    </div>
  );
};
