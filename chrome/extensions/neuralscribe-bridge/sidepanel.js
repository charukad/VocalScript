const elements = {
  workerId: document.getElementById("workerId"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  updatedAt: document.getElementById("updatedAt"),
  wsUrl: document.getElementById("wsUrl"),
  httpBaseUrl: document.getElementById("httpBaseUrl"),
  sessionToken: document.getElementById("sessionToken"),
  providerMeta: document.getElementById("providerMeta"),
  providerGrok: document.getElementById("providerGrok"),
  saveBtn: document.getElementById("saveBtn"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  logEntries: document.getElementById("logEntries"),
};

elements.saveBtn.addEventListener("click", saveSettings);
elements.connectBtn.addEventListener("click", connectBridge);
elements.disconnectBtn.addEventListener("click", disconnectBridge);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "bridge.statusChanged") {
    renderStatus(message.status);
    addLog(message.status.message);
  }
});

init();

async function init() {
  const response = await send({ type: "bridge.getStatus" });
  if (!response.ok) {
    addLog(response.error || "Could not read bridge status");
    return;
  }
  renderSettings(response.settings);
  renderStatus(response.status);
  addLog(response.status.message || "Ready");
}

async function saveSettings() {
  const response = await send({
    type: "bridge.saveSettings",
    settings: readSettings(),
  });
  if (response.ok) {
    renderSettings(response.settings);
    addLog("Settings saved");
  } else {
    addLog(response.error || "Settings save failed");
  }
}

async function connectBridge() {
  await saveSettings();
  const response = await send({ type: "bridge.connect" });
  if (response.ok) {
    renderStatus(response.status);
    addLog("Connect requested");
  } else {
    addLog(response.error || "Connect failed");
  }
}

async function disconnectBridge() {
  const response = await send({ type: "bridge.disconnect" });
  if (response.ok) {
    renderStatus(response.status);
    addLog("Disconnect requested");
  } else {
    addLog(response.error || "Disconnect failed");
  }
}

function readSettings() {
  const providers = [];
  if (elements.providerMeta.checked) providers.push("meta");
  if (elements.providerGrok.checked) providers.push("grok");
  return {
    wsUrl: elements.wsUrl.value,
    httpBaseUrl: elements.httpBaseUrl.value,
    sessionToken: elements.sessionToken.value,
    providers,
  };
}

function renderSettings(settings) {
  elements.wsUrl.value = settings.wsUrl || "";
  elements.httpBaseUrl.value = settings.httpBaseUrl || "";
  elements.sessionToken.value = settings.sessionToken || "";
  elements.providerMeta.checked = (settings.providers || []).includes("meta");
  elements.providerGrok.checked = (settings.providers || []).includes("grok");
}

function renderStatus(status) {
  elements.statusDot.className = "status-dot";
  if (status.status === "connected") elements.statusDot.classList.add("connected");
  if (status.status === "connecting") elements.statusDot.classList.add("connecting");
  elements.statusText.textContent = status.message || status.status || "Disconnected";
  elements.workerId.textContent = status.workerId || "Worker pending";
  elements.updatedAt.textContent = status.updatedAt ? new Date(status.updatedAt).toLocaleTimeString() : "-";
}

function addLog(message) {
  if (!message) return;
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  elements.logEntries.prepend(entry);
  while (elements.logEntries.children.length > 60) {
    elements.logEntries.lastElementChild?.remove();
  }
}

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: "No response" });
    });
  });
}
