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
  jobTimeoutMs: 180000,
};

let socket = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let jobLoopTimer = null;
let jobLoopActive = false;
let currentJob = null;
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
  updateStatus({
    jobRunning: true,
    jobMessage: "Job runner started",
  });
  await claimAndRunNextJob();
  scheduleJobLoop();
}

function stopJobLoop(message) {
  jobLoopActive = false;
  if (jobLoopTimer) {
    clearTimeout(jobLoopTimer);
    jobLoopTimer = null;
  }
  updateStatus({
    jobRunning: false,
    jobMessage: message,
  });
}

function scheduleJobLoop() {
  if (!jobLoopActive) return;
  if (jobLoopTimer) clearTimeout(jobLoopTimer);
  getSettings().then((settings) => {
    jobLoopTimer = setTimeout(async () => {
      await claimAndRunNextJob();
      scheduleJobLoop();
    }, Math.max(1000, settings.claimIntervalMs));
  });
}

async function claimAndRunNextJob() {
  if (currentJob) {
    updateStatus({ jobMessage: `Already running ${currentJob.id}` });
    return;
  }

  const settings = await getSettings();
  if (!settings.projectId) {
    updateStatus({ jobMessage: "Select a project before starting jobs" });
    return;
  }
  const provider = settings.providers.find((name) => PROVIDER_ADAPTERS[name]);
  if (!provider) {
    updateStatus({ jobMessage: "No supported provider is enabled" });
    return;
  }
  const adapter = PROVIDER_ADAPTERS[provider];

  const workerId = await getWorkerId();
  let job = null;
  try {
    job = await claimQueuedJob(settings, adapter.claimProvider, workerId);
  } catch (error) {
    updateStatus({ jobMessage: `Queue claim failed: ${error.message}` });
    return;
  }

  if (!job) {
    updateStatus({ jobMessage: "No queued jobs for selected project" });
    return;
  }

  currentJob = job;
  updateStatus({
    currentJob: job,
    jobMessage: `Running ${formatJobLabel(job)}`,
  });

  try {
    const result = await adapter.run(job, settings);
    if (result.status === "manual_action_required") {
      await updateJobStatus(settings, job.id, "manual_action_required", result.message, result.metadata);
      updateStatus({ jobMessage: `Manual action needed for ${formatJobLabel(job)}` });
      return;
    }

    await completeJob(settings, job.id, result.mediaUrl, result.mediaType, result.metadata, result.mediaVariants);
    updateStatus({ jobMessage: `Completed ${formatJobLabel(job)}` });
  } catch (error) {
    await updateJobStatus(settings, job.id, "failed", error.message, { provider: "meta" });
    updateStatus({ jobMessage: `Failed ${formatJobLabel(job)}: ${error.message}` });
  } finally {
    currentJob = null;
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

function formatJobLabel(job) {
  const project = job.projectId || job.metadata?.projectId || "no-project";
  return `${job.id} / ${project} / ${job.sceneId || "scene"}`;
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
    await chrome.tabs.update(existing.id, { active: true, url: existing.url || targetUrl });
    return existing;
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
