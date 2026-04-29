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

export function createWorkerReadyMessage(workerId, providers) {
  return {
    type: MESSAGE_TYPES.WORKER_READY,
    workerId,
    version: BRIDGE_PROTOCOL_VERSION,
    providers,
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
