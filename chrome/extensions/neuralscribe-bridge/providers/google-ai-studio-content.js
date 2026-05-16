const GOOGLE_AI_STUDIO_SELECTORS = {
  promptBox: [
    "textarea",
    "[contenteditable='true'][role='textbox']",
    "[contenteditable='true']",
    "[role='textbox']",
  ],
  generateButton: [
    "button",
    "[role='button']",
  ],
  audio: [
    "audio[src]",
    "audio source[src]",
    "a[href*='.wav']",
    "a[href*='.mp3']",
    "a[download]",
  ],
  manualAction: [
    "input[type='password']",
    "input[type='email']",
    "iframe[src*='captcha']",
    "[data-testid*='captcha' i]",
  ],
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "provider.google_ai_studio.ping") {
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === "provider.google_ai_studio.healthCheck") {
    runGoogleAiStudioHealthCheck()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type !== "provider.google_ai_studio.runJob") return false;
  runGoogleAiStudioJob(message.job, message.options || {})
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function runGoogleAiStudioHealthCheck() {
  const promptBox = await waitForPromptBox(2500);
  const generateButton = findGenerateButton();
  const audioCandidates = findAudioCandidates();
  const manualActionRequired = hasManualActionElement();
  const status = manualActionRequired
    ? "manual_action_required"
    : promptBox
      ? "ready"
      : "needs_login";
  return {
    health: {
      provider: "google_ai_studio",
      status,
      checkedAt: new Date().toISOString(),
      pageUrl: location.href,
      pageTitle: document.title,
      message: manualActionRequired
        ? "Google AI Studio needs login, captcha, or another manual action."
        : promptBox
          ? "Google AI Studio speech controls were detected."
          : "Google AI Studio speech prompt input was not detected.",
      manualActionRequired,
      canFindPrompt: Boolean(promptBox),
      canFindGenerateButton: Boolean(generateButton),
      canDetectMedia: audioCandidates.length > 0,
      canExtendVideo: false,
      metadata: {
        audioCandidateCount: String(audioCandidates.length),
      },
    },
    capability: {
      provider: "google_ai_studio",
      canGenerateImage: false,
      canGenerateVideo: false,
      canGenerateAudio: Boolean(promptBox) && !manualActionRequired,
      canExtendVideo: false,
      supportsVariants: false,
      supportsUpload: true,
      supportsDownload: true,
      metadata: {
        pageUrl: location.href,
      },
    },
  };
}

async function runGoogleAiStudioJob(job, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 180000);
  const promptBox = await waitForPromptBox(30000);
  if (!promptBox) {
    if (hasManualActionElement()) {
      return manualActionResult("Google AI Studio needs login or manual action before narration can start.");
    }
    throw new Error("Could not find Google AI Studio speech prompt input.");
  }

  const prompt = buildPrompt(job);
  await fillPrompt(promptBox, prompt);
  const generateButton = await waitForGenerateButton(15000);
  if (!generateButton) {
    return manualActionResult("Google AI Studio generate button was not detected or is disabled.");
  }

  const before = new Set(findAudioCandidates().map((candidate) => candidate.url));
  clickElement(generateButton);
  const audio = await waitForNewAudio(before, timeoutMs);
  if (!audio) {
    if (hasManualActionElement()) {
      return manualActionResult("Google AI Studio needs manual action before audio is available.");
    }
    throw new Error("Timed out waiting for generated Google AI Studio audio.");
  }

  let mediaUrl = audio.url;
  let localPath = "";
  if (isLocalObjectUrl(mediaUrl)) {
    const uploaded = await uploadLocalAudio(job, mediaUrl, options.httpBaseUrl);
    mediaUrl = uploaded.resultUrl;
    localPath = uploaded.localPath || "";
  }

  return {
    status: "completed",
    mediaUrl,
    mediaType: "audio",
    mediaVariants: [{
      id: "audio-1",
      url: mediaUrl,
      mediaType: "audio",
      localPath,
      source: localPath ? "backend" : "provider",
    }],
    metadata: {
      provider: "google_ai_studio",
      providerPageUrl: location.href,
      voiceMode: job.metadata?.voiceMode || "",
      narrationLineId: job.metadata?.narrationLineId || "",
    },
  };
}

function buildPrompt(job) {
  const voiceStyle = job.metadata?.voiceStyle ? `Voice style: ${job.metadata.voiceStyle}. ` : "";
  const emotion = job.metadata?.emotion ? `Emotion: ${job.metadata.emotion}. ` : "";
  const speed = job.metadata?.speed ? `Speed: ${job.metadata.speed}. ` : "";
  return `${voiceStyle}${emotion}${speed}${String(job.prompt || "").trim()}`.trim();
}

async function waitForPromptBox(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const box = queryFirst(GOOGLE_AI_STUDIO_SELECTORS.promptBox);
    if (box) return box;
    await sleep(250);
  }
  return null;
}

function findGenerateButton() {
  const buttons = queryAll(GOOGLE_AI_STUDIO_SELECTORS.generateButton);
  return buttons.find((button) => {
    const label = `${button.textContent || ""} ${button.getAttribute("aria-label") || ""}`.toLowerCase();
    return /generate|speak|create audio/.test(label) && !button.disabled;
  }) || null;
}

async function waitForGenerateButton(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const button = findGenerateButton();
    if (button) return button;
    await sleep(250);
  }
  return null;
}

function findAudioCandidates() {
  const candidates = [];
  queryAll(GOOGLE_AI_STUDIO_SELECTORS.audio).forEach((element) => {
    const url = element.currentSrc || element.src || element.href || element.getAttribute("src") || element.getAttribute("href");
    if (!url) return;
    candidates.push({ url });
  });
  return dedupeCandidates(candidates);
}

async function waitForNewAudio(before, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const candidate = findAudioCandidates().find((item) => !before.has(item.url));
    if (candidate) return candidate;
    await sleep(1000);
  }
  return null;
}

async function fillPrompt(element, value) {
  element.focus();
  if ("value" in element) {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  element.textContent = value;
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
}

async function uploadLocalAudio(job, mediaUrl, httpBaseUrl) {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error("Captured Google AI Studio audio blob, but could not read it.");
  }
  const blob = await response.blob();
  const extension = blob.type.includes("wav") ? "wav" : "mp3";
  const formData = new FormData();
  formData.append("mediaType", "audio");
  formData.append("metadata", JSON.stringify({
    provider: "google_ai_studio",
    providerPageUrl: location.href,
    capturedVia: "content-script-blob-upload",
  }));
  formData.append("file", blob, `${job.id}.${extension}`);
  const baseUrl = String(httpBaseUrl || "http://127.0.0.1:8000").replace(/\/$/, "");
  const uploadResponse = await fetch(`${baseUrl}/api/generation/jobs/${encodeURIComponent(job.id)}/result/upload`, {
    method: "POST",
    body: formData,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Generated audio upload failed: ${await uploadResponse.text()}`);
  }
  return uploadResponse.json();
}

function manualActionResult(message) {
  return {
    status: "manual_action_required",
    message,
    metadata: {
      provider: "google_ai_studio",
      providerPageUrl: location.href,
    },
  };
}

function hasManualActionElement() {
  return Boolean(queryFirst(GOOGLE_AI_STUDIO_SELECTORS.manualAction));
}

function queryFirst(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

function queryAll(selectors) {
  return selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

function clickElement(element) {
  element.scrollIntoView({ block: "center", inline: "nearest" });
  element.click();
}

function isLocalObjectUrl(url) {
  return String(url || "").startsWith("blob:");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
