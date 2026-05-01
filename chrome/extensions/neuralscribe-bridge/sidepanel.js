const elements = {
  workerId: document.getElementById("workerId"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  updatedAt: document.getElementById("updatedAt"),
  wsUrl: document.getElementById("wsUrl"),
  httpBaseUrl: document.getElementById("httpBaseUrl"),
  projectSelect: document.getElementById("projectSelect"),
  refreshProjectsBtn: document.getElementById("refreshProjectsBtn"),
  sessionToken: document.getElementById("sessionToken"),
  metaUrl: document.getElementById("metaUrl"),
  jobTimeoutSeconds: document.getElementById("jobTimeoutSeconds"),
  providerDelaySeconds: document.getElementById("providerDelaySeconds"),
  providerMeta: document.getElementById("providerMeta"),
  providerGrok: document.getElementById("providerGrok"),
  saveBtn: document.getElementById("saveBtn"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  jobRunnerText: document.getElementById("jobRunnerText"),
  currentJobText: document.getElementById("currentJobText"),
  currentProjectText: document.getElementById("currentProjectText"),
  startJobsBtn: document.getElementById("startJobsBtn"),
  claimOnceBtn: document.getElementById("claimOnceBtn"),
  stopJobsBtn: document.getElementById("stopJobsBtn"),
  clearJobHistoryBtn: document.getElementById("clearJobHistoryBtn"),
  jobList: document.getElementById("jobList"),
  logEntries: document.getElementById("logEntries"),
};

let projects = [];

elements.saveBtn.addEventListener("click", saveSettings);
elements.refreshProjectsBtn.addEventListener("click", () => refreshProjects());
elements.projectSelect.addEventListener("change", async () => {
  await saveSettings();
  await refreshJobList();
});
elements.connectBtn.addEventListener("click", connectBridge);
elements.disconnectBtn.addEventListener("click", disconnectBridge);
elements.startJobsBtn.addEventListener("click", startJobs);
elements.claimOnceBtn.addEventListener("click", claimOnce);
elements.stopJobsBtn.addEventListener("click", stopJobs);
elements.clearJobHistoryBtn.addEventListener("click", clearJobHistory);

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
  await refreshProjects(response.settings.projectId);
  renderStatus(response.status);
  await refreshJobList();
  addLog(response.status.message || "Ready");
}

async function saveSettings() {
  const response = await send({
    type: "bridge.saveSettings",
    settings: readSettings(),
  });
  if (response.ok) {
    renderSettings(response.settings);
    await refreshJobList();
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
    projectId: elements.projectSelect.value,
    sessionToken: elements.sessionToken.value,
    metaUrl: elements.metaUrl.value,
    jobTimeoutMs: Math.max(30, Number(elements.jobTimeoutSeconds.value) || 180) * 1000,
    providerDelayMs: Math.max(0, Number(elements.providerDelaySeconds.value) || 0) * 1000,
    providers,
  };
}

function renderSettings(settings) {
  elements.wsUrl.value = settings.wsUrl || "";
  elements.httpBaseUrl.value = settings.httpBaseUrl || "";
  if (settings.projectId && elements.projectSelect.value !== settings.projectId) {
    elements.projectSelect.value = settings.projectId;
  }
  elements.sessionToken.value = settings.sessionToken || "";
  elements.metaUrl.value = settings.metaUrl || "";
  elements.jobTimeoutSeconds.value = Math.round((settings.jobTimeoutMs || 180000) / 1000);
  elements.providerDelaySeconds.value = Math.round((settings.providerDelayMs || 12000) / 1000);
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
  elements.jobRunnerText.textContent = status.jobMessage || (status.jobRunning ? "Running" : "Stopped");
  elements.currentJobText.textContent = status.currentJob ? formatJob(status.currentJob) : "-";
  elements.currentProjectText.textContent = projectName(status.currentJob?.projectId || elements.projectSelect.value) || "-";
}

async function startJobs() {
  await saveSettings();
  const response = await send({ type: "jobs.start" });
  if (response.ok) {
    renderStatus(response.status);
    await refreshJobList();
    addLog("Job runner started");
  } else {
    addLog(response.error || "Job runner start failed");
  }
}

async function claimOnce() {
  await saveSettings();
  const response = await send({ type: "jobs.claimOnce" });
  if (response.ok) {
    renderStatus(response.status);
    await refreshJobList();
    addLog(response.status.jobMessage || "Run once complete");
  } else {
    addLog(response.error || "Run once failed");
  }
}

async function stopJobs() {
  const response = await send({ type: "jobs.stop" });
  if (response.ok) {
    renderStatus(response.status);
    await refreshJobList();
    addLog("Job runner stopped");
  } else {
    addLog(response.error || "Job runner stop failed");
  }
}

async function clearJobHistory() {
  const projectId = elements.projectSelect.value;
  if (!projectId) {
    addLog("Select a project before clearing job history");
    return;
  }
  try {
    const url = new URL(`${elements.httpBaseUrl.value.replace(/\/$/, "")}/api/generation/jobs/history`);
    const provider = selectedProviderFilter();
    if (provider) url.searchParams.set("provider", provider);
    url.searchParams.set("projectId", projectId);
    const response = await fetch(url, { method: "DELETE" });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    await refreshJobList();
    addLog(`Cleared ${Number(data.cleared || 0)} finished job${Number(data.cleared || 0) === 1 ? "" : "s"}`);
  } catch (error) {
    addLog(`Clear history failed: ${error.message}`);
  }
}

async function refreshProjects(selectedProjectId) {
  try {
    const response = await fetch(`${elements.httpBaseUrl.value.replace(/\/$/, "")}/api/projects`);
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    projects = Array.isArray(data.projects) ? data.projects : [];
    renderProjects(selectedProjectId || elements.projectSelect.value);
    await refreshJobList();
  } catch (error) {
    addLog(`Project refresh failed: ${error.message}`);
    renderProjects(selectedProjectId || elements.projectSelect.value);
  }
}

function renderProjects(selectedProjectId = "") {
  const current = selectedProjectId || "";
  elements.projectSelect.innerHTML = "";
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Select project";
  elements.projectSelect.append(emptyOption);
  projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = `${project.name} (${project.id.replace(/^project-/, "")})`;
    elements.projectSelect.append(option);
  });
  elements.projectSelect.value = current;
}

async function refreshJobList() {
  const projectId = elements.projectSelect.value;
  elements.jobList.innerHTML = "";
  if (!projectId) {
    renderJobListMessage("Select a project before running jobs.");
    return;
  }
  try {
    const url = new URL(`${elements.httpBaseUrl.value.replace(/\/$/, "")}/api/generation/jobs`);
    const provider = selectedProviderFilter();
    if (provider) url.searchParams.set("provider", provider);
    url.searchParams.set("projectId", projectId);
    const response = await fetch(url);
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    if (data.batchPaused) {
      renderJobListMessage("Batch is paused. Resume it in NeuralScribe before running more jobs.");
    }
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    if (jobs.length === 0) {
      renderJobListMessage("No jobs for this project.");
      return;
    }
    jobs.slice().reverse().forEach((job) => {
      const row = document.createElement("div");
      row.className = `job-row job-${String(job.status || "unknown").replaceAll("_", "-")}`;
      const attempt = job.metadata?.runAttempt ? ` · attempt ${escapeHtml(job.metadata.runAttempt)}` : "";
      const projectLabel = job.metadata?.projectName || projectName(job.projectId) || job.projectId || "No project";
      const aspect = job.metadata?.aspectRatio ? ` · ${escapeHtml(job.metadata.aspectRatio)}` : "";
      const flowLabel = job.metadata?.flow === "auto_animate" ? "Auto Animate" : "Auto Generate";
      const assetLabel = job.metadata?.animationAssetName || job.sceneId || "scene";
      row.innerHTML = `
        <strong>${escapeHtml(job.status)} · ${escapeHtml(assetLabel)}${attempt}</strong>
        <span>${escapeHtml(flowLabel)} · ${escapeHtml(projectLabel)} · ${escapeHtml(job.mediaType || "media")}${aspect}</span>
        <span>${escapeHtml(job.id)} · ${escapeHtml(job.batchId || "no batch")}</span>
      `;
      elements.jobList.append(row);
    });
  } catch (error) {
    renderJobListMessage(`Could not load jobs: ${error.message}`);
  }
}

function renderJobListMessage(message) {
  const row = document.createElement("div");
  row.className = "job-row";
  row.textContent = message;
  elements.jobList.append(row);
}

function projectName(projectId) {
  if (!projectId) return "";
  const project = projects.find((candidate) => candidate.id === projectId);
  return project ? project.name : projectId;
}

function selectedProviderFilter() {
  const providers = [];
  if (elements.providerMeta.checked) providers.push("meta");
  if (elements.providerGrok.checked) providers.push("grok");
  return providers.length === 1 ? providers[0] : "";
}

function formatJob(job) {
  return `${job.id} · ${projectName(job.projectId) || "No project"} · ${job.sceneId || "scene"}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
