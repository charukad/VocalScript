import React from 'react';
import {
  clearBrowserBridgeWorkerError,
  clearDisconnectedBridgeWorkers,
  getBrowserBridgeStatus,
  listBrowserBridgeDebugEvents,
  pauseBrowserBridgeWorker,
  resolveBackendMediaUrl,
  resumeBrowserBridgeWorker,
  runBrowserBridgeAdapterTest,
  runBrowserBridgeHealthCheck,
} from '../../lib/api/client';
import type { BridgeDebugEvent, BridgeWorkerSnapshot, ProviderCapability, ProviderHealthSnapshot } from '../../types';

type BrowserBridgeMonitorProps = {
  onClose: () => void;
};

type MonitorTab = 'active' | 'disconnected';

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

export const BrowserBridgeMonitor = ({ onClose }: BrowserBridgeMonitorProps) => {
  const [workers, setWorkers] = React.useState<BridgeWorkerSnapshot[]>([]);
  const [debugEvents, setDebugEvents] = React.useState<BridgeDebugEvent[]>([]);
  const [activeTab, setActiveTab] = React.useState<MonitorTab>('active');
  const [isLoading, setIsLoading] = React.useState(false);
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = React.useState<string>('');

  const refresh = React.useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const [statusResponse, debugResponse] = await Promise.all([
        getBrowserBridgeStatus(signal),
        listBrowserBridgeDebugEvents({ limit: 120, signal }),
      ]);
      setWorkers(statusResponse.workers);
      setDebugEvents(debugResponse.events);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Could not load bridge workers');
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
