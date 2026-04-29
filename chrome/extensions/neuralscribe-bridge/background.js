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
};

let socket = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let manualDisconnect = false;
let currentStatus = {
  connected: false,
  status: "disconnected",
  message: "Disconnected",
  workerId: "",
  lastMessage: null,
  updatedAt: new Date().toISOString(),
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
