import {
  DEFAULT_BRIDGE,
  PROVIDERS,
  createDebugEventMessage,
  createHeartbeatMessage,
  createHealthResultMessage,
  createProviderCapabilities,
  createWorkerReadyMessage,
} from "./shared/protocol.js";

const DEFAULT_SETTINGS = {
  wsUrl: DEFAULT_BRIDGE.WS_URL,
  httpBaseUrl: DEFAULT_BRIDGE.HTTP_BASE_URL,
  sessionToken: DEFAULT_BRIDGE.SESSION_TOKEN,
  providers: [PROVIDERS.META],
  accountLabel: "",
  chromeProfileLabel: "",
  projectId: "",
  metaUrl: "https://www.meta.ai/create",
  claimIntervalMs: 5000,
  providerDelayMs: 12000,
  jobTimeoutMs: 180000,
  captureFailureScreenshots: true,
};

const JOB_LOOP_ALARM = "neuralscribe-job-loop";
const IDLE_CLAIM_INTERVAL_MS = 15000;
const FAILURE_COOLDOWN_BASE_MS = 30000;
const FAILURE_COOLDOWN_MAX_MS = 5 * 60 * 1000;
const PROVIDER_FAILURE_PAUSE_THRESHOLD = 3;
const STORAGE_KEYS = {
  activeJob: "activeJob",
  jobLoopActive: "jobLoopActive",
  providerAvailableAt: "providerAvailableAt",
  providerFailureStreak: "providerFailureStreak",
};

let socket = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let jobLoopActive = false;
let currentJob = null;
let currentJobInProgress = false;
let jobRunToken = 0;
let manualDisconnect = false;
let latestHealth = [];
let lastProviderTabId = null;
let currentStatus = {
  connected: false,
  status: "disconnected",
  message: "Disconnected",
  workerId: "",
  extensionVersion: getExtensionVersion(),
  accountLabel: "",
  chromeProfileLabel: "",
  profileEmail: "",
  providers: [],
  capabilities: [],
  health: [],
  cooldownUntil: null,
  lastError: null,
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
    accountLabel: String(settings.accountLabel || "").trim(),
    chromeProfileLabel: String(settings.chromeProfileLabel || "").trim(),
    projectId: String(settings.projectId || "").trim(),
    metaUrl: String(settings.metaUrl || DEFAULT_SETTINGS.metaUrl).trim(),
    claimIntervalMs: Number(settings.claimIntervalMs || DEFAULT_SETTINGS.claimIntervalMs),
    providerDelayMs: Number(settings.providerDelayMs || DEFAULT_SETTINGS.providerDelayMs),
    jobTimeoutMs: Number(settings.jobTimeoutMs || DEFAULT_SETTINGS.jobTimeoutMs),
    captureFailureScreenshots: settings.captureFailureScreenshots !== false,
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
    sendWorkerReady(workerId, settings)
      .then((runtime) => {
        updateStatus({
          connected: true,
          status: "connected",
          message: "Connected to backend",
          workerId,
          extensionVersion: getExtensionVersion(),
          accountLabel: runtime.accountLabel,
          chromeProfileLabel: runtime.chromeProfileLabel,
          profileEmail: runtime.profileEmail,
          providers: settings.providers,
          capabilities: runtime.capabilities,
          lastError: null,
        });
      })
      .catch((error) => {
        updateStatus({ message: `Worker registration failed: ${error.message}`, lastError: error.message });
      });
    startHeartbeat(workerId, settings);
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
    handleBridgeSocketMessage(payload).catch((error) => {
      updateStatus({ message: `Bridge command failed: ${error.message}`, lastError: error.message });
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
      lastError: "Connection error",
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

async function sendWorkerReady(workerId, settings) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  const runtime = await buildWorkerRuntime(settings);
  socket.send(JSON.stringify(createWorkerReadyMessage(workerId, settings.providers, runtime)));
  return runtime;
}

function startHeartbeat(workerId, settings) {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(async () => {
    if (socket?.readyState === WebSocket.OPEN) {
      const latestSettings = await getSettings();
      const runtime = await buildWorkerRuntime(latestSettings);
      socket.send(JSON.stringify(createHeartbeatMessage(workerId, runtime)));
    }
  }, 10000);
}

async function buildWorkerRuntime(settings) {
  const profile = await getChromeProfileInfo();
  const accountLabel = settings.accountLabel || profile.email || "";
  const chromeProfileLabel = settings.chromeProfileLabel || profile.email || "";
  return {
    extensionVersion: getExtensionVersion(),
    providers: settings.providers,
    accountLabel,
    chromeProfileLabel,
    profileEmail: profile.email,
    capabilities: createProviderCapabilities(settings.providers),
    health: latestHealth,
    status: currentStatus.status,
    jobRunning: jobLoopActive,
    currentJobId: currentJob?.id || null,
    currentProjectId: currentJob?.projectId || settings.projectId || null,
    jobMessage: currentStatus.jobMessage || "",
    cooldownUntil: await getProviderCooldownUntil(),
    lastError: currentStatus.lastError || null,
  };
}

async function handleBridgeSocketMessage(payload) {
  if (!payload || typeof payload !== "object" || payload.type !== "bridge.command") return;
  const settings = await getSettings();
  const workerId = await getWorkerId();
  if (payload.workerId && payload.workerId !== workerId) return;
  if (payload.command === "health_check" || payload.command === "adapter_test") {
    await reportDebugEvent(
      payload.command === "adapter_test" ? "adapter_test_started" : "health_check_started",
      payload.command === "adapter_test" ? "Running Meta adapter test" : "Running Meta health check",
      { level: "info", provider: "meta" }
    );
    const result = await runProviderHealthCheck(settings, payload.command === "adapter_test");
    latestHealth = result.health;
    updateStatus({
      health: latestHealth,
      capabilities: result.capabilities,
      jobMessage: result.health[0]?.message || "Health check completed",
      lastError: result.health.some((item) => item.status === "error" || item.status === "blocked") ? result.health[0]?.message : null,
    });
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(createHealthResultMessage(workerId, result.health, result.capabilities)));
    }
    await reportDebugEvent(
      payload.command === "adapter_test" ? "adapter_test_completed" : "health_check_completed",
      result.health[0]?.message || "Provider health check completed",
      { level: result.health[0]?.status === "ready" ? "info" : "warning", provider: "meta" }
    );
  }
}

async function reportDebugEvent(step, message, options = {}) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  const workerId = await getWorkerId();
  socket.send(JSON.stringify(createDebugEventMessage(workerId, step, message, options)));
}

function getExtensionVersion() {
  return chrome.runtime.getManifest?.().version || "0.1.0";
}

async function getChromeProfileInfo() {
  if (!chrome.identity?.getProfileUserInfo) {
    return { email: "" };
  }
  return new Promise((resolve) => {
    try {
      chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }, (info) => {
        if (chrome.runtime.lastError) {
          resolve({ email: "" });
          return;
        }
        resolve({ email: info?.email || "" });
      });
    } catch {
      resolve({ email: "" });
    }
  });
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
    cooldownUntil: null,
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
  jobRunToken += 1;
  jobLoopActive = false;
  currentJob = null;
  currentJobInProgress = false;
  await chrome.storage.local.remove([
    STORAGE_KEYS.activeJob,
    STORAGE_KEYS.jobLoopActive,
    STORAGE_KEYS.providerAvailableAt,
    STORAGE_KEYS.providerFailureStreak,
  ]);
  await chrome.alarms.clear(JOB_LOOP_ALARM);
  updateStatus({
    jobRunning: false,
    currentJob: null,
    jobMessage: "Job runner reset",
    cooldownUntil: null,
    lastError: null,
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
    updateStatus({
      jobMessage: `Waiting ${Math.ceil(providerWaitMs / 1000)}s before next provider request`,
      cooldownUntil: await getProviderCooldownUntil(),
    });
    return { delayMs: providerWaitMs };
  }

  const workerId = await getWorkerId();
  let job = currentJob;
  if (!job) {
    try {
      job = await claimQueuedJob(settings, adapter.claimProvider, workerId);
    } catch (error) {
      updateStatus({ jobMessage: `Queue claim failed: ${error.message}`, lastError: error.message });
      return { delayMs: IDLE_CLAIM_INTERVAL_MS };
    }
  }

  if (job?.blocked) {
    updateStatus({ jobMessage: job.message || "Worker is waiting before claiming jobs", lastError: null });
    return { delayMs: Math.max(IDLE_CLAIM_INTERVAL_MS, settings.claimIntervalMs) };
  }

  if (!job) {
    updateStatus({ jobMessage: "No queued jobs for selected project" });
    return { delayMs: Math.max(IDLE_CLAIM_INTERVAL_MS, settings.claimIntervalMs) };
  }

  currentJob = job;
  currentJobInProgress = true;
  const runToken = jobRunToken;
  await chrome.storage.local.set({ [STORAGE_KEYS.activeJob]: job });
  updateStatus({
    currentJob: job,
    jobMessage: `Running ${formatJobLabel(job)}`,
    lastError: null,
  });

  try {
    const result = await adapter.run(job, settings);
    if (runToken !== jobRunToken) {
      updateStatus({ jobMessage: `Ignored stale provider result for ${formatJobLabel(job)}` });
      return { delayMs: Math.max(settings.providerDelayMs, settings.claimIntervalMs) };
    }
    if (result.status === "manual_action_required") {
      await updateJobStatus(settings, job.id, "manual_action_required", result.message, result.metadata);
      const recovery = await markProviderDelay(settings, { failure: true });
      updateStatus({
        jobRunning: recovery.autoPaused ? false : currentStatus.jobRunning,
        jobMessage: recovery.autoPaused
          ? `Paused after ${recovery.failureStreak} provider failures. Last issue: ${result.message || "manual action required"}`
          : `Manual action needed for ${formatJobLabel(job)}`,
        cooldownUntil: await getProviderCooldownUntil(),
        lastError: result.message || "Manual action required",
      });
      return { delayMs: Math.max(settings.providerDelayMs, settings.claimIntervalMs) };
    }

    await completeJob(settings, job.id, result.mediaUrl, result.mediaType, result.metadata, result.mediaVariants);
    await markProviderDelay(settings, { resetFailures: true });
    updateStatus({ jobMessage: `Completed ${formatJobLabel(job)}`, cooldownUntil: await getProviderCooldownUntil(), lastError: null });
    return { delayMs: Math.max(settings.providerDelayMs, settings.claimIntervalMs) };
  } catch (error) {
    if (runToken !== jobRunToken) {
      updateStatus({ jobMessage: `Ignored stale provider error for ${formatJobLabel(job)}` });
      return { delayMs: Math.max(settings.providerDelayMs, settings.claimIntervalMs) };
    }
    await updateJobStatus(settings, job.id, "failed", error.message, { provider: "meta" });
    await captureFailureScreenshot(settings, job, error).catch((screenshotError) => {
      reportDebugEvent("failure_screenshot_skipped", screenshotError.message, {
        provider: "meta",
        jobId: job.id,
        level: "warning",
      });
    });
    const recovery = await markProviderDelay(settings, { failure: true });
    updateStatus({
      jobRunning: recovery.autoPaused ? false : currentStatus.jobRunning,
      jobMessage: recovery.autoPaused
        ? `Paused after ${recovery.failureStreak} provider failures. Last failure: ${error.message}`
        : `Failed ${formatJobLabel(job)}: ${error.message}`,
      cooldownUntil: await getProviderCooldownUntil(),
      lastError: error.message,
    });
    return { delayMs: Math.max(settings.providerDelayMs, settings.claimIntervalMs) };
  } finally {
    if (runToken === jobRunToken) {
      currentJob = null;
      currentJobInProgress = false;
      await chrome.storage.local.remove(STORAGE_KEYS.activeJob);
      updateStatus({ currentJob: null });
    }
  }
}

async function claimQueuedJob(settings, provider, workerId) {
  const response = await fetch(`${settings.httpBaseUrl}/api/generation/jobs/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, workerId, projectId: settings.projectId }),
  });
  if (response.status === 404) return null;
  if (response.status === 409) return { blocked: true, message: await responseText(response) };
  if (!response.ok) throw new Error(await responseText(response));
  return response.json();
}

async function getProviderDelayMs(settings) {
  if (Number(settings.providerDelayMs || 0) <= 0) return 0;
  const stored = await chrome.storage.local.get(STORAGE_KEYS.providerAvailableAt);
  const availableAt = Number(stored[STORAGE_KEYS.providerAvailableAt] || 0);
  return Math.max(0, availableAt - Date.now());
}

async function getProviderCooldownUntil() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.providerAvailableAt);
  const availableAt = Number(stored[STORAGE_KEYS.providerAvailableAt] || 0);
  return availableAt > Date.now() ? new Date(availableAt).toISOString() : null;
}

async function markProviderDelay(settings, options = {}) {
  const baseDelayMs = Math.max(0, Number(settings.providerDelayMs || 0));
  let delayMs = baseDelayMs;
  let failureStreak = await getProviderFailureStreak();
  let autoPaused = false;

  if (options.resetFailures) {
    failureStreak = 0;
    await chrome.storage.local.set({ [STORAGE_KEYS.providerFailureStreak]: 0 });
  }

  if (options.failure) {
    failureStreak += 1;
    await chrome.storage.local.set({ [STORAGE_KEYS.providerFailureStreak]: failureStreak });
    const failureDelay = Math.max(FAILURE_COOLDOWN_BASE_MS, baseDelayMs) * failureStreak;
    delayMs = Math.min(Math.max(baseDelayMs, failureDelay), FAILURE_COOLDOWN_MAX_MS);
    if (failureStreak >= PROVIDER_FAILURE_PAUSE_THRESHOLD) {
      autoPaused = true;
      jobLoopActive = false;
      await chrome.storage.local.set({ [STORAGE_KEYS.jobLoopActive]: false });
      await chrome.alarms.clear(JOB_LOOP_ALARM);
      await reportDebugEvent("provider_auto_pause", `Paused worker after ${failureStreak} provider failures`, {
        provider: "meta",
        level: "warning",
        metadata: { failureStreak: String(failureStreak) },
      });
    }
  }

  if (delayMs <= 0) {
    await chrome.storage.local.remove(STORAGE_KEYS.providerAvailableAt);
    return { delayMs: 0, failureStreak, autoPaused };
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.providerAvailableAt]: Date.now() + delayMs });
  return { delayMs, failureStreak, autoPaused };
}

async function getProviderFailureStreak() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.providerFailureStreak);
  return Math.max(0, Number(stored[STORAGE_KEYS.providerFailureStreak] || 0));
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

async function captureFailureScreenshot(settings, job, error) {
  if (settings.captureFailureScreenshots === false) {
    throw new Error("Failure screenshots are disabled in bridge settings");
  }
  if (!lastProviderTabId) throw new Error("No provider tab available for screenshot");
  const tab = await chrome.tabs.get(lastProviderTabId);
  const url = String(tab.url || "");
  if (!tab.windowId || !url.includes("meta.ai")) {
    throw new Error("Skipped screenshot because provider tab is not a Meta page");
  }
  if (/login|password|captcha|checkpoint|payment/i.test(url)) {
    throw new Error("Skipped screenshot because provider page may contain sensitive login or captcha content");
  }
  await chrome.tabs.update(tab.id, { active: true });
  await sleep(300);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const blob = dataUrlToBlob(dataUrl);
  const formData = new FormData();
  const workerId = await getWorkerId();
  formData.append("workerId", workerId);
  formData.append("jobId", job.id);
  formData.append("provider", "meta");
  formData.append("reason", `Failed ${formatJobLabel(job)}: ${error.message}`);
  formData.append("metadata", JSON.stringify({
    providerPageUrl: url,
    projectId: job.projectId || "",
    sceneId: job.sceneId || "",
  }));
  formData.append("file", blob, `${job.id}-failure.png`);
  const response = await fetch(`${settings.httpBaseUrl}/api/browser-bridge/debug/screenshots`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) throw new Error(`Failure screenshot upload failed: ${await responseText(response)}`);
  const result = await response.json();
  await reportDebugEvent("failure_screenshot_uploaded", "Failure screenshot uploaded", {
    provider: "meta",
    jobId: job.id,
    level: "error",
    metadata: { screenshotUrl: result.screenshotUrl || "" },
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/i.exec(header)?.[1] || "image/png";
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
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
  if (job.metadata?.jobType === "extend_video") {
    return runMetaExtendVideoJob(job, settings);
  }
  await reportDebugEvent("provider_tab_opening", `Opening Meta for ${formatJobLabel(job)}`, {
    provider: "meta",
    jobId: job.id,
    metadata: { promptLength: String((job.prompt || "").length), mediaType: job.mediaType || "image" },
  });
  const tab = await findOrOpenProviderTab(settings.metaUrl, "*://*.meta.ai/*");
  lastProviderTabId = tab.id || null;
  await reportDebugEvent("provider_tab_ready_wait", "Waiting for Meta tab to finish loading", {
    provider: "meta",
    jobId: job.id,
    metadata: { tabId: String(tab.id || ""), url: tab.url || "" },
  });
  await waitForTabReady(tab.id);
  await ensureMetaContentScript(tab.id);
  await reportDebugEvent("content_script_ready", "Meta content script is ready", {
    provider: "meta",
    jobId: job.id,
  });
  const response = await sendMetaRunJobMessage(tab.id, {
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
  await reportDebugEvent("provider_job_completed", `Meta returned ${response.result?.mediaType || job.mediaType || "media"} result`, {
    provider: "meta",
    jobId: job.id,
    metadata: {
      variantCount: String(response.result?.mediaVariants?.length || 0),
      providerPageUrl: response.result?.metadata?.providerPageUrl || "",
    },
  });
  return response.result;
}

async function runMetaExtendVideoJob(job, settings) {
  await reportDebugEvent("extend_video_started", `Opening Meta Extend for ${formatJobLabel(job)}`, {
    provider: "meta",
    jobId: job.id,
    metadata: {
      sourceJobId: job.metadata?.sourceJobId || "",
      sourceMediaUrl: job.metadata?.sourceMediaUrl || "",
      continuationPromptLength: String((job.metadata?.continuationPrompt || "").length),
    },
  });
  const tab = await findOrOpenProviderTab(settings.metaUrl, "*://*.meta.ai/*");
  lastProviderTabId = tab.id || null;
  await waitForTabReady(tab.id);
  await ensureMetaContentScript(tab.id);
  const response = await sendMetaRunJobMessage(tab.id, {
    type: "provider.meta.extendVideo",
    job,
    options: {
      timeoutMs: Math.max(settings.jobTimeoutMs, 240000),
      httpBaseUrl: settings.httpBaseUrl,
    },
  });
  if (!response?.ok) {
    throw new Error(response?.error || "Meta Extend Video adapter failed");
  }
  await reportDebugEvent("extend_video_completed", "Meta Extend Video returned a result", {
    provider: "meta",
    jobId: job.id,
    metadata: {
      sourceJobId: job.metadata?.sourceJobId || "",
      variantCount: String(response.result?.mediaVariants?.length || 0),
      providerPageUrl: response.result?.metadata?.providerPageUrl || "",
    },
  });
  return response.result;
}

async function runProviderHealthCheck(settings, includeAdapterTest = false) {
  const workerId = await getWorkerId();
  try {
    const tab = await findOrOpenProviderTab(settings.metaUrl, "*://*.meta.ai/*");
    lastProviderTabId = tab.id || null;
    await waitForTabReady(tab.id);
    await ensureMetaContentScript(tab.id);
    const response = await sendTabMessage(tab.id, {
      type: "provider.meta.healthCheck",
      options: { includeAdapterTest },
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Meta health check failed");
    }
    return {
      health: [response.health],
      capabilities: [response.capability],
    };
  } catch (error) {
    return {
      health: [{
        provider: "meta",
        status: "error",
        checkedAt: new Date().toISOString(),
        pageUrl: "",
        pageTitle: "",
        message: error.message,
        manualActionRequired: false,
        canFindPrompt: false,
        canFindGenerateButton: false,
        canDetectMedia: false,
        canExtendVideo: false,
        metadata: { workerId },
      }],
      capabilities: createProviderCapabilities([PROVIDERS.META]),
    };
  }
}

async function findOrOpenProviderTab(targetUrl, queryUrl) {
  const tabs = await chrome.tabs.query({ url: queryUrl });
  const existing = tabs.find((tab) => tab.url?.startsWith(targetUrl)) || tabs[0];
  if (existing?.id) {
    const shouldNavigate = !String(existing.url || "").startsWith(targetUrl);
    return chrome.tabs.update(existing.id, {
      active: true,
      ...(shouldNavigate ? { url: targetUrl } : {}),
    });
  }
  return chrome.tabs.create({ url: targetUrl, active: true });
}

async function waitForTabReady(tabId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90000) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") {
      const readyState = await getTabReadyState(tabId).catch(() => "unknown");
      if (readyState === "complete" || readyState === "interactive" || readyState === "unknown") {
        await sleep(1500);
        return;
      }
    }
    await sleep(500);
  }
  throw new Error("Timed out waiting for provider tab");
}

async function getTabReadyState(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.readyState,
  });
  return result?.result || "unknown";
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

async function sendMetaRunJobMessage(tabId, message) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await sendTabMessage(tabId, message);
      if (response) return response;
      lastError = new Error("Meta provider adapter returned no response");
    } catch (error) {
      lastError = error;
      const retryable = /message channel closed|receiving end does not exist|extension context invalidated/i.test(error.message || "");
      if (!retryable || attempt === 3) break;
      await waitForTabReady(tabId).catch(() => {});
      await ensureMetaContentScript(tabId).catch(() => {});
      await sleep(1200 * attempt);
    }
  }
  throw lastError || new Error("Meta provider adapter failed");
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
