import React from 'react';
import {
  clearBrowserBridgeWorkerError,
  clearDisconnectedBridgeWorkers,
  clearBrowserBridgeDebugScreenshots,
  clearGenerationJobHistory,
  getBrowserBridgeStatus,
  listBrowserBridgeDebugEvents,
  listGenerationJobs,
  pauseBrowserBridgeWorker,
  pauseGenerationBatch,
  resolveBackendMediaUrl,
  resumeBrowserBridgeWorker,
  resumeGenerationBatch,
  retryGenerationJob,
  runBrowserBridgeAdapterTest,
  runBrowserBridgeHealthCheck,
  selectGenerationJobVariant,
} from '../../lib/api/client';
import type {
  BridgeDebugEvent,
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

const statusLabel = (status: BridgeWorkerSnapshot['status']) => status.replaceAll('_', ' ');

const isWorkerConnectedNow = (worker: BridgeWorkerSnapshot): boolean =>
  worker.status !== 'disconnected' && worker.status !== 'stale' && !worker.disconnectedAt;

const shortWorkerId = (workerId: string): string => workerId.replace(/^neuralscribe-/, '').slice(0, 8);

const workerDisplayName = (worker: BridgeWorkerSnapshot): string =>
  worker.chromeProfileLabel ||
  worker.accountLabel ||
  worker.profileEmail ||
  `Profile ${shortWorkerId(worker.workerId)}`;

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

const queueWorkerId = (job: GenerationJob): string => job.metadata.workerId || '';

const canRetryQueueJob = (job: GenerationJob): boolean =>
  failedQueueStatuses.includes(job.status);

const queueResultLabel = (job: GenerationJob): string => {
  const variants = job.resultVariants?.length ?? 0;
  if (variants > 0) return `${variants} variant${variants === 1 ? '' : 's'}`;
  if (job.resultUrl) return '1 result';
  return '-';
};

export const BrowserBridgeMonitor = ({ onClose }: BrowserBridgeMonitorProps) => {
  const [workers, setWorkers] = React.useState<BridgeWorkerSnapshot[]>([]);
  const [debugEvents, setDebugEvents] = React.useState<BridgeDebugEvent[]>([]);
  const [queueJobs, setQueueJobs] = React.useState<GenerationJob[]>([]);
  const [activeTab, setActiveTab] = React.useState<MonitorTab>('active');
  const [queueStatusFilter, setQueueStatusFilter] = React.useState<QueueStatusFilter>('all');
  const [queueFlowFilter, setQueueFlowFilter] = React.useState<QueueFlowFilter>('all');
  const [queueProviderFilter, setQueueProviderFilter] = React.useState<QueueProviderFilter>('all');
  const [queueWorkerFilter, setQueueWorkerFilter] = React.useState<string>('all');
  const [queueProjectFilter, setQueueProjectFilter] = React.useState<string>('all');
  const [queueMediaFilter, setQueueMediaFilter] = React.useState<QueueMediaFilter>('all');
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [queueMessage, setQueueMessage] = React.useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = React.useState<string>('');

  const refresh = React.useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const [statusResponse, debugResponse, queueResponse] = await Promise.all([
        getBrowserBridgeStatus(signal),
        listBrowserBridgeDebugEvents({ limit: 120, signal }),
        listGenerationJobs({ signal }),
      ]);
      setWorkers(statusResponse.workers);
      setDebugEvents(debugResponse.events);
      setQueueJobs(queueResponse.jobs);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Could not load bridge monitor data');
    } finally {
      setIsLoading(false);
    }
  }, []);

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
      const debugResponse = await listBrowserBridgeDebugEvents({ limit: 120 });
      setDebugEvents(debugResponse.events);
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
  const selectedJob = React.useMemo(
    () => queueJobs.find(job => job.id === selectedJobId) ?? filteredQueueJobs[0] ?? null,
    [filteredQueueJobs, queueJobs, selectedJobId]
  );
  const selectedJobEvents = selectedJob ? eventsByJob.get(selectedJob.id) ?? [] : [];
  const selectedWorker = selectedJob
    ? workers.find(worker => worker.workerId === queueWorkerId(selectedJob))
    : null;
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
                    <small>{queueFlowLabel(job)} · {job.provider} · {job.mediaType} · {queueProjectLabel(job)}</small>
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
                  {selectedJob.resultUrl && (
                    <a href={resolveBackendMediaUrl(selectedJob.resultUrl)} target="_blank" rel="noreferrer">
                      Open Result
                    </a>
                  )}
                </div>
                <div className="bridge-job-detail-grid">
                  <div><span>Workflow</span><strong>{queueFlowLabel(selectedJob)}</strong></div>
                  <div><span>Provider</span><strong>{selectedJob.provider}</strong></div>
                  <div><span>Project</span><strong>{queueProjectLabel(selectedJob)}</strong></div>
                  <div><span>Worker</span><strong>{selectedWorker ? workerDisplayName(selectedWorker) : queueWorkerId(selectedJob) || '-'}</strong></div>
                  <div><span>Result</span><strong>{queueResultLabel(selectedJob)}</strong></div>
                  <div><span>Attempt</span><strong>{selectedJob.metadata.runAttempt || '-'}</strong></div>
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
                        <small>{eventTime(event)}{event.provider ? ` · ${event.provider}` : ''}</small>
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
              </div>

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
