import {
  DEFAULT_BRIDGE,
  PROVIDERS,
  createHeartbeatMessage,
  createWorkerReadyMessage,
} from "./shared/protocol.js";

const DEFAULT_SETTINGS = {
  wsUrl: DEFAULT_BRIDGE.WS_URL,
  httpBaseUrl: DEFAULT_BRIDGE.HTTP_BASE_URL,
  sessionToken: DEFAULT_BRIDGE.SESSION_TOKEN,
  providers: [PROVIDERS.META],
  projectId: "",
  metaUrl: "https://www.meta.ai/create",
  claimIntervalMs: 5000,
  providerDelayMs: 12000,
  jobTimeoutMs: 180000,
};

const JOB_LOOP_ALARM = "neuralscribe-job-loop";
const IDLE_CLAIM_INTERVAL_MS = 15000;
const STORAGE_KEYS = {
  activeJob: "activeJob",
  jobLoopActive: "jobLoopActive",
  providerAvailableAt: "providerAvailableAt",
};

let socket = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let jobLoopActive = false;
let currentJob = null;
let currentJobInProgress = false;
let manualDisconnect = false;
let currentStatus = {
  connected: false,
  status: "disconnected",
  message: "Disconnected",
  workerId: "",
  jobRunning: false,
  currentJob: null,
  jobMessage: "Job runner stopped",
  lastMessage: null,
  updatedAt: new Date().toISOString(),
};

const PROVIDER_ADAPTERS = {
  [PROVIDERS.META]: {
    claimProvider: PROVIDERS.META,
    run: runMetaJob,
  },
};

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...stored });
});

chrome.runtime.onStartup.addListener(() => {
  restoreRuntimeState().catch((error) => {
    updateStatus({ jobMessage: `Runner restore failed: ${error.message}` });
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== JOB_LOOP_ALARM) return;
  handleJobLoopAlarm().catch((error) => {
    updateStatus({ jobMessage: `Job runner alarm failed: ${error.message}` });
    scheduleJobLoop();
  });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleRuntimeMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function handleRuntimeMessage(message) {
  switch (message?.type) {
    case "bridge.getStatus":
      await restoreRuntimeState();
      return { ok: true, status: currentStatus, settings: await getSettings() };
    case "bridge.saveSettings":
      await chrome.storage.local.set(sanitizeSettings(message.settings || {}));
      return { ok: true, settings: await getSettings() };
    case "bridge.connect":
      manualDisconnect = false;
      await connect();
      return { ok: true, status: currentStatus };
    case "bridge.disconnect":
      manualDisconnect = true;
      disconnect("Disconnected by user");
      return { ok: true, status: currentStatus };
    case "jobs.start":
      await startJobLoop();
      return { ok: true, status: currentStatus };
    case "jobs.stop":
      stopJobLoop("Job runner stopped");
      return { ok: true, status: currentStatus };
    case "jobs.reset":
      await resetJobRunner();
      return { ok: true, status: currentStatus };
    case "jobs.claimOnce":
      await claimAndRunNextJob();
      return { ok: true, status: currentStatus };
    default:
      return { ok: false, error: "Unknown message type" };
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...stored };
}

function sanitizeSettings(settings) {
  return {
    wsUrl: String(settings.wsUrl || DEFAULT_SETTINGS.wsUrl).trim(),
    httpBaseUrl: String(settings.httpBaseUrl || DEFAULT_SETTINGS.httpBaseUrl).trim(),
    sessionToken: String(settings.sessionToken || DEFAULT_SETTINGS.sessionToken).trim(),
    providers: Array.isArray(settings.providers) && settings.providers.length > 0
      ? settings.providers.filter((provider) => Object.values(PROVIDERS).includes(provider))
      : DEFAULT_SETTINGS.providers,
    projectId: String(settings.projectId || "").trim(),
    metaUrl: String(settings.metaUrl || DEFAULT_SETTINGS.metaUrl).trim(),
    claimIntervalMs: Number(settings.claimIntervalMs || DEFAULT_SETTINGS.claimIntervalMs),
    providerDelayMs: Number(settings.providerDelayMs || DEFAULT_SETTINGS.providerDelayMs),
    jobTimeoutMs: Number(settings.jobTimeoutMs || DEFAULT_SETTINGS.jobTimeoutMs),
  };
}

async function connect() {
  const settings = await getSettings();
  const workerId = await getWorkerId();
  const wsUrl = withToken(settings.wsUrl, settings.sessionToken);

  clearReconnect();
  cleanupSocket();
  updateStatus({
    connected: false,
    status: "connecting",
    message: "Connecting to backend...",
    workerId,
  });

  socket = new WebSocket(wsUrl);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify(createWorkerReadyMessage(workerId, settings.providers)));
    startHeartbeat(workerId);
    updateStatus({
      connected: true,
      status: "connected",
      message: "Connected to backend",
      workerId,
    });
  });

  socket.addEventListener("message", (event) => {
    let payload = event.data;
    try {
      payload = JSON.parse(event.data);
    } catch {
      payload = { raw: event.data };
    }
    updateStatus({
      lastMessage: payload,
      message: messageLabel(payload),
    });
  });

  socket.addEventListener("close", () => {
    cleanupSocket();
    updateStatus({
      connected: false,
      status: "disconnected",
      message: manualDisconnect ? "Disconnected" : "Connection lost",
    });
    if (!manualDisconnect) scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    updateStatus({
      connected: false,
      status: "error",
      message: "Connection error",
    });
  });
}

async function getWorkerId() {
  const stored = await chrome.storage.local.get("workerId");
  if (stored.workerId) return stored.workerId;
  const workerId = `neuralscribe-${crypto.randomUUID()}`;
  await chrome.storage.local.set({ workerId });
  return workerId;
}

function withToken(rawUrl, token) {
  const url = new URL(rawUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function startHeartbeat(workerId) {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(createHeartbeatMessage(workerId)));
    }
  }, 10000);
}

function scheduleReconnect() {
  clearReconnect();
  reconnectTimer = setTimeout(() => {
    connect();
  }, 3000);
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function disconnect(message) {
  clearReconnect();
  cleanupSocket();
  stopJobLoop("Job runner stopped");
  updateStatus({
    connected: false,
    status: "disconnected",
    message,
  });
}

function cleanupSocket() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  if (socket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
    socket = null;
  }
}

function updateStatus(patch) {
  currentStatus = {
    ...currentStatus,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  chrome.runtime.sendMessage({ type: "bridge.statusChanged", status: currentStatus }).catch(() => {});
}

function messageLabel(payload) {
  if (!payload || typeof payload !== "object") return "Message received";
  if (payload.type === "bridge.ready_ack") return "Worker registered";
  if (payload.type === "bridge.heartbeat_ack") return "Heartbeat acknowledged";
  if (payload.type === "bridge.hello") return "Backend greeted bridge";
  if (payload.type === "bridge.error") return payload.error || "Bridge error";
  return `Received ${payload.type || "message"}`;
}

async function startJobLoop() {
  jobLoopActive = true;
  await chrome.storage.local.set({ [STORAGE_KEYS.jobLoopActive]: true });
  updateStatus({
    jobRunning: true,
    jobMessage: "Job runner started",
  });
  const result = await claimAndRunNextJob();
  scheduleJobLoop(result?.delayMs ?? null);
}

function stopJobLoop(message) {
  jobLoopActive = false;
  chrome.storage.local.set({ [STORAGE_KEYS.jobLoopActive]: false }).catch(() => {});
  chrome.alarms.clear(JOB_LOOP_ALARM).catch(() => {});
  updateStatus({
    jobRunning: false,
    jobMessage: message,
  });
}

async function resetJobRunner() {
  jobLoopActive = false;
  currentJob = null;
  currentJobInProgress = false;
  await chrome.storage.local.remove([
    STORAGE_KEYS.activeJob,
    STORAGE_KEYS.jobLoopActive,
    STORAGE_KEYS.providerAvailableAt,
  ]);
  await chrome.alarms.clear(JOB_LOOP_ALARM);
  updateStatus({
    jobRunning: false,
    currentJob: null,
    jobMessage: "Job runner reset",
  });
}

async function scheduleJobLoop(delayOverrideMs = null) {
  if (!jobLoopActive) return;
  const settings = await getSettings();
  const delayMs = Math.max(1000, delayOverrideMs ?? settings.claimIntervalMs);
  await chrome.alarms.clear(JOB_LOOP_ALARM);
  await chrome.alarms.create(JOB_LOOP_ALARM, { when: Date.now() + delayMs });
}

async function handleJobLoopAlarm() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.jobLoopActive,
    STORAGE_KEYS.activeJob,
  ]);
  jobLoopActive = Boolean(stored[STORAGE_KEYS.jobLoopActive]);
  if (stored[STORAGE_KEYS.activeJob] && !currentJob) {
    currentJob = stored[STORAGE_KEYS.activeJob];
  }
  if (!jobLoopActive) return;
  updateStatus({ jobRunning: true });
  const result = await claimAndRunNextJob();
  scheduleJobLoop(result?.delayMs ?? null);
}

async function restoreRuntimeState() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.activeJob,
    STORAGE_KEYS.jobLoopActive,
  ]);
  if (stored[STORAGE_KEYS.activeJob] && !currentJob) {
    currentJob = stored[STORAGE_KEYS.activeJob];
  }
  jobLoopActive = Boolean(stored[STORAGE_KEYS.jobLoopActive]);
  updateStatus({
    jobRunning: jobLoopActive,
    currentJob,
    jobMessage: currentJob
      ? `Recovering ${formatJobLabel(currentJob)}`
      : jobLoopActive
        ? "Job runner resumed"
        : currentStatus.jobMessage,
  });
  if (jobLoopActive) await scheduleJobLoop(1000);
}

async function claimAndRunNextJob() {
  if (currentJobInProgress) {
    updateStatus({ jobMessage: `Already running ${currentJob.id}` });
    return { delayMs: 5000 };
  }

  const settings = await getSettings();
  if (!settings.projectId) {
    updateStatus({ jobMessage: "Select a project before starting jobs" });
    return { delayMs: IDLE_CLAIM_INTERVAL_MS };
  }
  const provider = settings.providers.find((name) => PROVIDER_ADAPTERS[name]);
  if (!provider) {
    updateStatus({ jobMessage: "No supported provider is enabled" });
    return { delayMs: IDLE_CLAIM_INTERVAL_MS };
  }
  const adapter = PROVIDER_ADAPTERS[provider];

  const providerWaitMs = await getProviderDelayMs(settings);
  if (providerWaitMs > 0) {
    updateStatus({ jobMessage: `Waiting ${Math.ceil(providerWaitMs / 1000)}s before next provider request` });
    return { delayMs: providerWaitMs };
  }

  const workerId = await getWorkerId();
  let job = currentJob;
  if (!job) {
    try {
      job = await claimQueuedJob(settings, adapter.claimProvider, workerId);
    } catch (error) {
      updateStatus({ jobMessage: `Queue claim failed: ${error.message}` });
      return { delayMs: IDLE_CLAIM_INTERVAL_MS };
    }
  }

  if (!job) {
    updateStatus({ jobMessage: "No queued jobs for selected project" });
    return { delayMs: Math.max(IDLE_CLAIM_INTERVAL_MS, settings.claimIntervalMs) };
  }

  currentJob = job;
  currentJobInProgress = true;
  await chrome.storage.local.set({ [STORAGE_KEYS.activeJob]: job });
  updateStatus({
    currentJob: job,
    jobMessage: `Running ${formatJobLabel(job)}`,
  });

  try {
    const result = await adapter.run(job, settings);
    if (result.status === "manual_action_required") {
      await updateJobStatus(settings, job.id, "manual_action_required", result.message, result.metadata);
      await markProviderDelay(settings);
      updateStatus({ jobMessage: `Manual action needed for ${formatJobLabel(job)}` });
      return { delayMs: Math.max(settings.providerDelayMs, settings.claimIntervalMs) };
    }

    await completeJob(settings, job.id, result.mediaUrl, result.mediaType, result.metadata, result.mediaVariants);
    await markProviderDelay(settings);
    updateStatus({ jobMessage: `Completed ${formatJobLabel(job)}` });
    return { delayMs: Math.max(settings.providerDelayMs, settings.claimIntervalMs) };
  } catch (error) {
    await updateJobStatus(settings, job.id, "failed", error.message, { provider: "meta" });
    await markProviderDelay(settings);
    updateStatus({ jobMessage: `Failed ${formatJobLabel(job)}: ${error.message}` });
    return { delayMs: Math.max(settings.providerDelayMs, settings.claimIntervalMs) };
  } finally {
    currentJob = null;
    currentJobInProgress = false;
    await chrome.storage.local.remove(STORAGE_KEYS.activeJob);
    updateStatus({ currentJob: null });
  }
}

async function claimQueuedJob(settings, provider, workerId) {
  const response = await fetch(`${settings.httpBaseUrl}/api/generation/jobs/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, workerId, projectId: settings.projectId }),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await responseText(response));
  return response.json();
}

async function getProviderDelayMs(settings) {
  if (Number(settings.providerDelayMs || 0) <= 0) return 0;
  const stored = await chrome.storage.local.get(STORAGE_KEYS.providerAvailableAt);
  const availableAt = Number(stored[STORAGE_KEYS.providerAvailableAt] || 0);
  return Math.max(0, availableAt - Date.now());
}

async function markProviderDelay(settings) {
  const delayMs = Math.max(0, Number(settings.providerDelayMs || 0));
  if (delayMs === 0) return;
  await chrome.storage.local.set({ [STORAGE_KEYS.providerAvailableAt]: Date.now() + delayMs });
}

function formatJobLabel(job) {
  const project = job.metadata?.projectName || job.projectId || job.metadata?.projectId || "no-project";
  const attempt = job.metadata?.runAttempt ? ` / attempt ${job.metadata.runAttempt}` : "";
  return `${job.id} / ${project} / ${job.sceneId || "scene"}${attempt}`;
}

async function updateJobStatus(settings, jobId, status, error, metadata = {}) {
  const response = await fetch(`${settings.httpBaseUrl}/api/generation/jobs/${jobId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, error, metadata }),
  });
  if (!response.ok) throw new Error(await responseText(response));
  return response.json();
}

async function completeJob(settings, jobId, mediaUrl, mediaType, metadata = {}, mediaVariants = []) {
  const response = await fetch(`${settings.httpBaseUrl}/api/generation/jobs/${jobId}/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaUrl, mediaType, mediaVariants, metadata }),
  });
  if (!response.ok) throw new Error(await responseText(response));
  return response.json();
}

async function responseText(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return parsed.detail || text;
  } catch {
    return text || response.statusText;
  }
}

async function runMetaJob(job, settings) {
  const tab = await findOrOpenProviderTab(settings.metaUrl, "*://*.meta.ai/*");
  await waitForTabReady(tab.id);
  await ensureMetaContentScript(tab.id);
  const response = await sendTabMessage(tab.id, {
    type: "provider.meta.runJob",
    job,
    options: {
      timeoutMs: settings.jobTimeoutMs,
      httpBaseUrl: settings.httpBaseUrl,
    },
  });
  if (!response?.ok) {
    throw new Error(response?.error || "Meta provider adapter failed");
  }
  return response.result;
}

async function findOrOpenProviderTab(targetUrl, queryUrl) {
  const tabs = await chrome.tabs.query({ url: queryUrl });
  const existing = tabs.find((tab) => tab.url?.startsWith(targetUrl)) || tabs[0];
  if (existing?.id) {
    const tab = await chrome.tabs.update(existing.id, { active: true, url: targetUrl });
    await chrome.tabs.reload(existing.id, { bypassCache: true });
    return tab;
  }
  return chrome.tabs.create({ url: targetUrl, active: true });
}

function waitForTabReady(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for provider tab"));
    }, 60000);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }).catch(reject);
  });
}

async function ensureMetaContentScript(tabId) {
  try {
    await sendTabMessage(tabId, { type: "provider.meta.ping" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["providers/meta-content.js"],
    });
  }
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}
