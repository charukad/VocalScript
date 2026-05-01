export const BRIDGE_PROTOCOL_VERSION = "0.1.0";

export const PROVIDERS = Object.freeze({
  META: "meta",
  GROK: "grok",
});

export const MEDIA_TYPES = Object.freeze({
  IMAGE: "image",
  VIDEO: "video",
});

export const MESSAGE_TYPES = Object.freeze({
  WORKER_READY: "worker.ready",
  JOB_START: "job.start",
  JOB_STATUS: "job.status",
  JOB_RESULT: "job.result",
  JOB_ERROR: "job.error",
  HEARTBEAT: "worker.heartbeat",
  HEALTH_RESULT: "worker.health_result",
  DEBUG_EVENT: "worker.debug_event",
  BRIDGE_COMMAND: "bridge.command",
  BRIDGE_HELLO: "bridge.hello",
  BRIDGE_READY_ACK: "bridge.ready_ack",
  BRIDGE_HEARTBEAT_ACK: "bridge.heartbeat_ack",
  BRIDGE_ERROR: "bridge.error",
});

export const JOB_STATUSES = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELED: "canceled",
  MANUAL_ACTION_REQUIRED: "manual_action_required",
});

export const PROVIDER_STATUSES = Object.freeze({
  NEEDS_LOGIN: "needs_login",
  READY: "ready",
  SUBMITTING: "submitting",
  GENERATING: "generating",
  MEDIA_FOUND: "media_found",
  FAILED: "failed",
  MANUAL_ACTION_REQUIRED: "manual_action_required",
});

export const DEFAULT_BRIDGE = Object.freeze({
  HTTP_BASE_URL: "http://127.0.0.1:8000",
  WS_URL: "ws://127.0.0.1:8000/api/browser-bridge/ws",
  SESSION_TOKEN: "dev-local",
});

export function createProviderCapabilities(providers) {
  return providers.map((provider) => ({
    provider,
    canGenerateImage: provider === PROVIDERS.META || provider === PROVIDERS.GROK,
    canGenerateVideo: provider === PROVIDERS.META || provider === PROVIDERS.GROK,
    canExtendVideo: false,
    supportsVariants: provider === PROVIDERS.META,
    supportsUpload: true,
    supportsDownload: true,
    metadata: {},
  }));
}

export function createWorkerReadyMessage(workerId, providers, runtime = {}) {
  return {
    type: MESSAGE_TYPES.WORKER_READY,
    workerId,
    version: BRIDGE_PROTOCOL_VERSION,
    extensionVersion: runtime.extensionVersion || BRIDGE_PROTOCOL_VERSION,
    providers,
    accountLabel: runtime.accountLabel || "",
    chromeProfileLabel: runtime.chromeProfileLabel || "",
    profileEmail: runtime.profileEmail || "",
    capabilities: runtime.capabilities || createProviderCapabilities(providers),
    currentJobId: runtime.currentJobId || null,
    currentProjectId: runtime.currentProjectId || null,
    cooldownUntil: runtime.cooldownUntil || null,
    lastError: runtime.lastError || null,
  };
}

export function createHeartbeatMessage(workerId, runtime = {}) {
  return {
    type: MESSAGE_TYPES.HEARTBEAT,
    workerId,
    sentAt: new Date().toISOString(),
    providers: runtime.providers || [],
    status: runtime.status || null,
    jobRunning: Boolean(runtime.jobRunning),
    currentJobId: runtime.currentJobId || null,
    currentProjectId: runtime.currentProjectId || null,
    jobMessage: runtime.jobMessage || "",
    cooldownUntil: runtime.cooldownUntil || null,
    lastError: runtime.lastError || null,
    accountLabel: runtime.accountLabel || "",
    chromeProfileLabel: runtime.chromeProfileLabel || "",
    profileEmail: runtime.profileEmail || "",
    capabilities: runtime.capabilities || createProviderCapabilities(runtime.providers || []),
    health: runtime.health || [],
  };
}

export function createHealthResultMessage(workerId, health = [], capabilities = []) {
  return {
    type: MESSAGE_TYPES.HEALTH_RESULT,
    workerId,
    health,
    capabilities,
  };
}

export function createDebugEventMessage(workerId, step, message, options = {}) {
  return {
    type: MESSAGE_TYPES.DEBUG_EVENT,
    id: `debug-${crypto.randomUUID?.() || Date.now()}`,
    workerId,
    jobId: options.jobId || null,
    provider: options.provider || null,
    level: options.level || "info",
    step,
    message,
    createdAt: new Date().toISOString(),
    metadata: options.metadata || {},
  };
}

export function createJobStatusMessage(jobId, status, message = "") {
  return {
    type: MESSAGE_TYPES.JOB_STATUS,
    jobId,
    status,
    message,
  };
}

export function createJobResultMessage(jobId, mediaUrl, mediaType, metadata = {}) {
  return {
    type: MESSAGE_TYPES.JOB_RESULT,
    jobId,
    mediaUrl,
    mediaType,
    metadata,
  };
}
