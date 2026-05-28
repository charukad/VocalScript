const GOOGLE_AI_STUDIO_PROVIDER = "google_ai_studio";

const GOOGLE_AI_STUDIO_SELECTORS = {
  promptBox: [
    "[aria-label*='speech block' i]",
    "[aria-label*='speech' i][role='textbox']",
    "[aria-label*='narration' i][role='textbox']",
    "[aria-label*='dialogue' i][role='textbox']",
    "textarea",
    "textarea[aria-label*='text' i]",
    "textarea[aria-label*='prompt' i]",
    "textarea[aria-label*='script' i]",
    "textarea[aria-label*='speech' i]",
    "textarea[aria-label*='narration' i]",
    "textarea[placeholder*='text' i]",
    "textarea[placeholder*='prompt' i]",
    "textarea[placeholder*='script' i]",
    "textarea[placeholder*='speech' i]",
    "textarea[placeholder*='narration' i]",
    "input[type='text'][aria-label*='prompt' i]",
    "input[type='text'][placeholder*='prompt' i]",
    "[contenteditable='true'][role='textbox']",
    "[contenteditable='true'][aria-label*='prompt' i]",
    "[contenteditable='true'][aria-label*='speech' i]",
    "[contenteditable='true'][aria-label*='narration' i]",
    "[contenteditable='true']",
    "[role='textbox']",
    "[aria-label*='prompt' i]",
    "[aria-label*='sample context' i]",
    "[aria-label*='scene' i]",
    "[data-testid*='prompt' i]",
  ],
  generateButton: [
    "button",
    "[role='button']",
  ],
  audio: [
    "audio",
    "audio[src]",
    "audio source[src]",
    "source[type*='audio' i]",
    "source[src][type*='audio' i]",
    "a[href*='.wav' i]",
    "a[href*='.mp3' i]",
    "a[href*='.m4a' i]",
    "a[href*='.ogg' i]",
    "a[href^='blob:']",
    "a[href^='data:audio']",
    "a[href*='audio' i]",
    "a[download]",
  ],
  manualAction: [
    "input[type='password']",
    "input[type='email']",
    "iframe[src*='captcha' i]",
    "[data-testid*='captcha' i]",
    "[aria-label*='captcha' i]",
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
  if (message?.type === "provider.google_ai_studio.adapterTest") {
    runGoogleAiStudioAdapterTest(message.options || {})
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
  await dismissBlockingDialogs();
  const promptBox = await waitForPromptBox(2500);
  const generateButton = findGenerateButton(promptBox);
  const audioCandidates = findAudioCandidates();
  const manualActionRequired = hasManualActionElement();
  const status = manualActionRequired
    ? "manual_action_required"
    : promptBox
      ? "ready"
      : "needs_login";
  return {
    health: {
      provider: GOOGLE_AI_STUDIO_PROVIDER,
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
        promptSelector: promptBox ? selectorHint(promptBox) : "",
        generateButtonSelector: generateButton ? selectorHint(generateButton) : "",
        generateButtonLabel: generateButton ? elementLabel(generateButton).slice(0, 120) : "",
        uiSummary: uiDebugSummary(),
      },
    },
    capability: {
      provider: GOOGLE_AI_STUDIO_PROVIDER,
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
  await dismissBlockingDialogs();
  const promptBox = await waitForPromptBox(30000);
  if (!promptBox) {
    if (hasManualActionElement()) {
      return manualActionResult("Google AI Studio needs login or manual action before narration can start.");
    }
    throw new Error(`Could not find Google AI Studio speech prompt input. ${uiDebugSummary()}`);
  }

  const prompt = buildPrompt(job);
  await fillTtsContextFields(job, promptBox);
  await fillPrompt(promptBox, prompt);
  const generateButton = await waitForGenerateButton(15000, promptBox);
  if (!generateButton) {
    return manualActionResult(`Google AI Studio generate button was not detected or is disabled. ${uiDebugSummary()}`);
  }

  const beforeCandidates = findAudioCandidates();
  const before = new Set(beforeCandidates.map((candidate) => candidate.url));
  clickElement(generateButton);
  const audio = await waitForNewAudio(before, timeoutMs);
  if (!audio) {
    if (hasManualActionElement()) {
      return manualActionResult("Google AI Studio needs manual action before audio is available.");
    }
    throw new Error(`Timed out waiting for generated Google AI Studio audio. ${uiDebugSummary()}`);
  }

  const capture = await captureAudioResult(job, audio, options.httpBaseUrl, {
    adapterTestId: options.adapterTestId || "",
    captureMode: options.captureMode || "",
  });
  const mediaUrl = capture.mediaUrl;
  const localPath = capture.localPath;
  const durationSeconds = await readAudioDuration(audio.element);

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
    mediaDataUrl: capture.mediaDataUrl || "",
    mimeType: capture.mimeType || "",
    fileExtension: capture.fileExtension || "",
    metadata: {
      provider: GOOGLE_AI_STUDIO_PROVIDER,
      providerPageUrl: location.href,
      voiceMode: job.metadata?.voiceMode || "",
      narrationLineId: job.metadata?.narrationLineId || "",
      capturedVia: capture.capturedVia,
      audioUrlKind: capture.audioUrlKind,
      audioCandidateCountBefore: String(beforeCandidates.length),
      audioCandidateCountAfter: String(findAudioCandidates().length),
      ...(durationSeconds ? { durationSeconds: String(durationSeconds) } : {}),
    },
  };
}

async function runGoogleAiStudioAdapterTest(options = {}) {
  const submitFullTest = Boolean(options.submitFullTest);
  const testPrompt = String(
    options.fullTestPrompt || "Read this sentence clearly for a NeuralScribe adapter test."
  ).trim();
  const base = await runGoogleAiStudioHealthCheck();
  const promptBox = await waitForPromptBox(10000);
  let promptInserted = false;
  let generateButton = null;
  let result = null;

  if (promptBox) {
    await fillPrompt(promptBox, testPrompt);
    promptInserted = await waitForPromptText(promptBox, testPrompt, 4000);
    generateButton = await waitForGenerateButton(6000, promptBox);
  }

  if (submitFullTest) {
    if (!promptBox || !promptInserted) {
      throw new Error(`Full Google AI Studio adapter test could not insert the prompt. ${uiDebugSummary()}`);
    }
    if (!generateButton) {
      throw new Error(`Full Google AI Studio adapter test could not find an enabled generate button. ${uiDebugSummary()}`);
    }
    result = await runGoogleAiStudioJob(
      {
        id: options.adapterTestId || `adapter-test-${Date.now()}`,
        sceneId: "adapter-test",
        projectId: "",
        provider: GOOGLE_AI_STUDIO_PROVIDER,
        mediaType: "audio",
        prompt: testPrompt,
        negativePrompt: "",
        metadata: {
          voiceMode: "adapter_test",
          jobType: "adapter_test",
        },
      },
      {
        timeoutMs: 180000,
        httpBaseUrl: options.httpBaseUrl,
        adapterTestId: options.adapterTestId || "adapter-test",
      }
    );
  } else if (promptBox) {
    await fillPrompt(promptBox, "");
  }

  const status = base.health.manualActionRequired
    ? base.health.status
    : promptInserted && generateButton
      ? "ready"
      : base.health.status;
  const message = submitFullTest
    ? `Full Google AI Studio adapter test ${result?.mediaUrl ? "generated audio successfully" : "completed"}.`
    : `Safe Google AI Studio adapter test ${promptInserted ? "inserted prompt" : "could not insert prompt"} and ${generateButton ? "found generate button" : "did not find generate button"}.`;
  const adapterMetadata = {
    ...base.health.metadata,
    adapterTest: "true",
    adapterTestId: options.adapterTestId || "",
    submitFullTest: String(submitFullTest),
    promptInserted: String(promptInserted),
    generateButtonFound: String(Boolean(generateButton)),
    adapterResultUrl: result?.mediaUrl || "",
    adapterVariantCount: String(result?.mediaVariants?.length || 0),
    uiSummary: uiDebugSummary(),
  };

  return {
    health: {
      ...base.health,
      status,
      message,
      canFindPrompt: Boolean(promptBox),
      canFindGenerateButton: Boolean(generateButton),
      canDetectMedia: base.health.canDetectMedia || Boolean(result?.mediaUrl),
      metadata: adapterMetadata,
    },
    capability: {
      ...base.capability,
      canGenerateAudio: Boolean(promptBox) && !base.health.manualActionRequired,
      metadata: {
        ...base.capability.metadata,
        adapterTest: "true",
        promptInserted: String(promptInserted),
        generateButtonFound: String(Boolean(generateButton)),
      },
    },
  };
}

function buildPrompt(job) {
  return String(job.prompt || "").trim();
}

function buildTtsContext(job) {
  const details = [];
  if (job.metadata?.voiceStyle) details.push(`Voice style: ${job.metadata.voiceStyle}.`);
  if (job.metadata?.emotion) details.push(`Emotion: ${job.metadata.emotion}.`);
  if (job.metadata?.speed) details.push(`Speed: ${job.metadata.speed}.`);
  if (job.metadata?.voiceMode) details.push(`Mode: ${job.metadata.voiceMode.replace(/_/g, " ")}.`);
  return details.join(" ").trim();
}

async function fillTtsContextFields(job, promptBox) {
  const fields = findTtsFields();
  const sceneText = buildTtsScene(job);
  const contextText = buildTtsContext(job);
  if (fields.scene && fields.scene !== promptBox && sceneText) {
    await fillPrompt(fields.scene, sceneText);
  }
  if (fields.sampleContext && fields.sampleContext !== promptBox && contextText) {
    await fillPrompt(fields.sampleContext, contextText);
  }
}

function buildTtsScene(job) {
  const projectName = job.metadata?.projectName || job.projectId || "";
  const mode = job.metadata?.voiceMode === "line_by_line" ? "clip-by-clip narration" : "full-script narration";
  return projectName
    ? `NeuralScribe ${mode} for ${projectName}.`
    : `NeuralScribe ${mode}.`;
}

function findTtsFields() {
  const candidates = queryAll(GOOGLE_AI_STUDIO_SELECTORS.promptBox)
    .filter((element) => isVisibleElement(element) && isEditableTextElement(element));
  return {
    scene: findEditableByLabel(candidates, /(^|\b)scene\b/i),
    sampleContext: findEditableByLabel(candidates, /sample context|context/i),
    speechBlock: findEditableByLabel(candidates, /speech block|speech block text|speech text|dialogue|narration/i),
  };
}

function findEditableByLabel(candidates, pattern) {
  return candidates.find((element) => pattern.test(elementLabel(element))) || null;
}

async function waitForPromptBox(timeoutMs) {
  const startedAt = Date.now();
  let lastDialogDismissedAt = 0;
  let templateActivated = false;
  while (Date.now() - startedAt < timeoutMs) {
    if (Date.now() - lastDialogDismissedAt > 1500) {
      const dismissed = await dismissBlockingDialogs();
      if (dismissed) lastDialogDismissedAt = Date.now();
    }
    const box = findPromptBox();
    if (box) return box;
    if (!templateActivated) {
      templateActivated = await activateSpeechTemplate();
      if (templateActivated) {
        await sleep(1200);
        continue;
      }
    }
    await sleep(250);
  }
  return null;
}

async function activateSpeechTemplate() {
  const templateButton = findSpeechTemplateButton();
  if (!templateButton) return false;
  clickElement(templateButton);
  return true;
}

function findSpeechTemplateButton() {
  const buttons = queryAll(GOOGLE_AI_STUDIO_SELECTORS.generateButton)
    .filter((button) => isVisibleElement(button) && !isDisabledControl(button))
    .map((button) => ({ button, label: elementLabel(button) }));
  const preferred = [
    /master storyteller/i,
    /ad voiceover/i,
    /everyday assistant/i,
    /training guide/i,
  ];
  for (const pattern of preferred) {
    const match = buttons.find((item) => pattern.test(item.label));
    if (match) return match.button;
  }
  return buttons.find((item) => /speech|voice|story|narrat/i.test(item.label))?.button || null;
}

async function dismissBlockingDialogs() {
  let dismissed = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const button = findBlockingDialogButton();
    if (!button) break;
    clickElement(button);
    dismissed = true;
    await sleep(800);
  }
  return dismissed;
}

function findBlockingDialogButton() {
  const dialogRoots = queryAll([
    "[role='dialog']",
    "[aria-modal='true']",
    "mat-dialog-container",
    ".mat-mdc-dialog-container",
    ".cdk-overlay-pane",
  ]).filter(isVisibleElement);
  const buttons = queryAll(GOOGLE_AI_STUDIO_SELECTORS.generateButton)
    .filter((button) => isVisibleElement(button) && !isDisabledControl(button))
    .filter((button) => dialogRoots.length === 0 || dialogRoots.some((root) => containsDeep(root, button)));
  return buttons.find((button) => {
    const label = elementLabel(button);
    if (/accept permissions|remove extension/i.test(label)) return false;
    return /^(continue|got it|ok|okay|close|dismiss)$/i.test(label) || /close dialog/i.test(label);
  }) || null;
}

function findPromptBox() {
  const fields = findTtsFields();
  if (fields.speechBlock) return fields.speechBlock;
  const candidates = queryAll(GOOGLE_AI_STUDIO_SELECTORS.promptBox)
    .filter((element) => isVisibleElement(element) && isEditableTextElement(element))
    .map((element) => ({ element, score: scorePromptBox(element) }))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score);
  return candidates[0]?.element || null;
}

function scorePromptBox(element) {
  const label = elementLabel(element);
  let score = 0;
  if (/speech block|speech block text|speech text|dialogue|narration/i.test(label)) score += 24;
  if (/sample context|scene\b|model selection|api key/i.test(label)) score -= 16;
  if (element.matches?.("textarea")) score += 10;
  if (element.matches?.("[contenteditable='true']")) score += 8;
  if (element.matches?.("[role='textbox']")) score += 7;
  if (/prompt|script|text|speech|voice|narration|say/i.test(label)) score += 8;
  if (/search|filter|email|password|name/i.test(label)) score -= 12;
  const rect = element.getBoundingClientRect();
  if (rect.width >= 240) score += 4;
  if (rect.height >= 32) score += 2;
  return score;
}

function findGenerateButton(promptBox = null) {
  const buttons = queryAll(GOOGLE_AI_STUDIO_SELECTORS.generateButton)
    .filter((button) => isVisibleElement(button) && !isDisabledControl(button))
    .map((button) => ({ button, score: scoreGenerateButton(button, promptBox) }))
    .filter((item) => item.score >= 6)
    .sort((first, second) => second.score - first.score);
  return buttons[0]?.button || null;
}

function scoreGenerateButton(button, promptBox) {
  const label = elementLabel(button);
  let score = 0;
  if (/generate|speak|create audio|create speech|run|submit|send|play|start|render/i.test(label)) score += 12;
  if (/download|share|copy|close|cancel|delete|remove|like|dislike|menu|settings|profile|login|sign in|sign out/i.test(label)) score -= 30;
  if (button.matches?.("button")) score += 2;
  if (button.getAttribute("type") === "submit") score += 4;
  if (button.querySelector?.("svg, mat-icon, [class*='icon' i]")) score += 2;
  if (promptBox && isNearPromptSubmitPosition(button, promptBox)) score += 8;
  if (promptBox && !label && button.querySelector?.("svg, mat-icon, [class*='icon' i]") && isNearPromptSubmitPosition(button, promptBox)) score += 8;
  return score;
}

async function waitForGenerateButton(timeoutMs, promptBox = null) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const button = findGenerateButton(promptBox);
    if (button) return button;
    await sleep(250);
  }
  return null;
}

async function waitForPromptText(element, expected, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = readElementText(element);
    if (String(value || "").trim() === expected.trim()) return true;
    await sleep(200);
  }
  return false;
}

function findAudioCandidates() {
  const candidates = [];
  queryAll(GOOGLE_AI_STUDIO_SELECTORS.audio).forEach((element) => {
    const url = mediaUrlFromElement(element);
    if (!url) return;
    if (!looksLikeAudioUrl(url, element)) return;
    candidates.push({ url, element });
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
  element.scrollIntoView({ block: "center", inline: "nearest" });
  element.focus();
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    setNativeValue(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (element.isContentEditable) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const inserted = document.execCommand?.("insertText", false, value);
    if (!inserted) {
      element.textContent = value;
    }
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  element.textContent = value;
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeValue(element, value) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

async function captureAudioResult(job, audio, httpBaseUrl, options = {}) {
  const audioUrlKind = classifyAudioUrl(audio.url);
  try {
    const blob = await blobFromMediaUrl(audio.url);
    const extension = extensionFromBlob(blob, "audio");
    const metadata = {
      capturedVia: isLocalObjectUrl(audio.url) ? "content-script-blob-upload" : "content-script-fetch-upload",
      audioUrlKind,
    };
    if (options.captureMode === "background_upload" && !options.adapterTestId) {
      return {
        mediaUrl: "",
        localPath: "",
        mediaDataUrl: await blobToDataUrl(blob),
        mimeType: blob.type || "audio/mpeg",
        fileExtension: extension,
        capturedVia: isLocalObjectUrl(audio.url) ? "content-script-blob-background-upload" : "content-script-fetch-background-upload",
        audioUrlKind,
      };
    }
    const uploaded = options.adapterTestId
      ? await uploadAdapterTestAudioBlob(options.adapterTestId, blob, extension, httpBaseUrl)
      : await uploadAudioBlob(job, blob, extension, httpBaseUrl, metadata);
    return {
      mediaUrl: uploaded.resultUrl,
      localPath: uploaded.localPath || "",
      capturedVia: isLocalObjectUrl(audio.url) ? "content-script-blob-upload" : "content-script-fetch-upload",
      audioUrlKind,
    };
  } catch (error) {
    if (isLocalObjectUrl(audio.url) || String(audio.url || "").startsWith("data:")) {
      throw error;
    }
    return {
      mediaUrl: audio.url,
      localPath: "",
      capturedVia: "provider-url",
      audioUrlKind,
    };
  }
}

async function uploadAdapterTestAudioFromUrl(testId, mediaUrl, httpBaseUrl) {
  const blob = await blobFromMediaUrl(mediaUrl);
  const extension = extensionFromBlob(blob, "audio");
  return uploadAdapterTestAudioBlob(testId, blob, extension, httpBaseUrl);
}

async function uploadAdapterTestAudioBlob(testId, blob, extension, httpBaseUrl) {
  const formData = new FormData();
  formData.append("files", blob, `${testId}.${extension}`);
  const baseUrl = String(httpBaseUrl || "http://127.0.0.1:8000").replace(/\/$/, "");
  const uploadResponse = await fetch(`${baseUrl}/api/browser-bridge/adapter-tests/${encodeURIComponent(testId)}/media`, {
    method: "POST",
    body: formData,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Adapter audio upload failed: ${await uploadResponse.text()}`);
  }
  const payload = await uploadResponse.json();
  return {
    resultUrl: payload.resultUrl,
    localPath: "",
  };
}

async function uploadAudioFromUrl(job, mediaUrl, httpBaseUrl, metadata = {}) {
  const blob = await blobFromMediaUrl(mediaUrl);
  const extension = extensionFromBlob(blob, "audio");
  return uploadAudioBlob(job, blob, extension, httpBaseUrl, metadata);
}

async function uploadAudioBlob(job, blob, extension, httpBaseUrl, metadata = {}) {
  const formData = new FormData();
  formData.append("mediaType", "audio");
  formData.append("metadata", JSON.stringify({
    provider: GOOGLE_AI_STUDIO_PROVIDER,
    providerPageUrl: location.href,
    voiceMode: job.metadata?.voiceMode || "",
    narrationLineId: job.metadata?.narrationLineId || "",
    ...metadata,
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

async function blobFromMediaUrl(mediaUrl) {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error("Captured Google AI Studio audio, but could not read it.");
  }
  return response.blob();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not encode generated audio."));
    reader.readAsDataURL(blob);
  });
}

async function readAudioDuration(element) {
  const mediaElement = element instanceof HTMLMediaElement
    ? element
    : element.closest?.("audio, video");
  if (!(mediaElement instanceof HTMLMediaElement)) return null;
  if (Number.isFinite(mediaElement.duration) && mediaElement.duration > 0) {
    return Number(mediaElement.duration.toFixed(3));
  }
  await new Promise((resolve) => {
    const timeoutId = window.setTimeout(resolve, 1500);
    mediaElement.addEventListener("loadedmetadata", () => {
      window.clearTimeout(timeoutId);
      resolve();
    }, { once: true });
  });
  return Number.isFinite(mediaElement.duration) && mediaElement.duration > 0
    ? Number(mediaElement.duration.toFixed(3))
    : null;
}

function manualActionResult(message) {
  return {
    status: "manual_action_required",
    message,
    metadata: {
      provider: GOOGLE_AI_STUDIO_PROVIDER,
      providerPageUrl: location.href,
      uiSummary: uiDebugSummary(),
    },
  };
}

function hasManualActionElement() {
  if (queryFirst(GOOGLE_AI_STUDIO_SELECTORS.manualAction, true)) return true;
  return /sign in|login|captcha|verify you are human|access denied|permission|not available/i.test(deepTextContent(document));
}

function queryFirst(selectors, visibleOnly = false) {
  for (const selector of selectors) {
    const element = querySelectorAllDeep(selector)
      .find((candidate) => !visibleOnly || isVisibleElement(candidate));
    if (element) return element;
  }
  return null;
}

function queryAll(selectors) {
  return uniqueElements(selectors.flatMap((selector) => querySelectorAllDeep(selector)));
}

function querySelectorAllDeep(selector, root = document) {
  const results = [];
  const roots = [];
  const seenRoots = new Set();

  const addRoot = (candidate) => {
    if (candidate && !seenRoots.has(candidate)) {
      seenRoots.add(candidate);
      roots.push(candidate);
    }
  };

  addRoot(root);
  for (let index = 0; index < roots.length; index += 1) {
    const current = roots[index];
    if (current instanceof Element && current.matches(selector)) {
      results.push(current);
    }
    current.querySelectorAll?.(selector).forEach((element) => results.push(element));
    current.querySelectorAll?.("*").forEach((element) => {
      if (element.shadowRoot) addRoot(element.shadowRoot);
    });
  }

  return uniqueElements(results);
}

function uniqueElements(elements) {
  return [...new Set(elements.filter(Boolean))];
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

function readElementText(element) {
  if (!element) return "";
  if ("value" in element) return element.value;
  return element.innerText || element.textContent || "";
}

function elementLabel(element) {
  if (!element) return "";
  return normalizeText([
    element.getAttribute?.("aria-label") || "",
    element.getAttribute?.("placeholder") || "",
    element.getAttribute?.("title") || "",
    element.getAttribute?.("data-testid") || "",
    element.getAttribute?.("type") || "",
    element.innerText || element.textContent || "",
  ].join(" "));
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function mediaUrlFromElement(element) {
  if (!element) return "";
  const srcset = element.getAttribute?.("srcset");
  if (srcset) return parseSrcsetUrl(srcset);
  return element.currentSrc ||
    element.src ||
    element.href ||
    element.getAttribute?.("src") ||
    element.getAttribute?.("href") ||
    "";
}

function parseSrcsetUrl(srcset) {
  const candidates = String(srcset || "")
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0])
    .filter(Boolean);
  return candidates[candidates.length - 1] || "";
}

function looksLikeAudioUrl(url, element) {
  const value = String(url || "");
  const type = element.getAttribute?.("type") || "";
  const download = element.getAttribute?.("download") || "";
  return (
    value.startsWith("blob:") ||
    value.startsWith("data:audio") ||
    /\.(wav|mp3|m4a|ogg|aac)(\?|#|$)/i.test(value) ||
    /audio/i.test(`${value} ${type} ${download} ${elementLabel(element)}`)
  );
}

function selectorHint(element) {
  if (!element) return "";
  if (element.id) return `#${element.id}`;
  if (element.getAttribute("data-testid")) return `[data-testid="${element.getAttribute("data-testid")}"]`;
  if (element.getAttribute("aria-label")) return `[aria-label="${element.getAttribute("aria-label")}"]`;
  if (element.getAttribute("placeholder")) return `[placeholder="${element.getAttribute("placeholder")}"]`;
  return element.tagName.toLowerCase();
}

function clickElement(element) {
  element.scrollIntoView({ block: "center", inline: "nearest" });
  element.focus?.();
  element.click();
}

function isLocalObjectUrl(url) {
  return String(url || "").startsWith("blob:");
}

function classifyAudioUrl(url) {
  const value = String(url || "");
  if (value.startsWith("blob:")) return "blob";
  if (value.startsWith("data:")) return "data";
  if (value.startsWith("http://") || value.startsWith("https://")) return "remote";
  return "other";
}

function extensionFromBlob(blob, fallbackMediaType) {
  const type = String(blob?.type || "").toLowerCase();
  if (type.includes("wav")) return "wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("mp4") || type.includes("m4a")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  return fallbackMediaType === "audio" ? "mp3" : "bin";
}

function isEditableTextElement(element) {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    return ["text", "search", "url", ""].includes(String(element.type || "").toLowerCase());
  }
  return Boolean(element.isContentEditable || element.getAttribute?.("role") === "textbox");
}

function isVisibleElement(element) {
  if (!element || !(element instanceof Element)) return false;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    Number(style.opacity || "1") > 0
  );
}

function isDisabledControl(element) {
  return Boolean(
    element.disabled ||
    element.getAttribute?.("aria-disabled") === "true" ||
    element.closest?.("[aria-disabled='true'], [disabled]")
  );
}

function isNearPromptSubmitPosition(button, promptBox) {
  const promptRect = promptBox.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  if (!promptRect.width || !promptRect.height || !buttonRect.width || !buttonRect.height) return false;
  const buttonCenterX = (buttonRect.left + buttonRect.right) / 2;
  const buttonCenterY = (buttonRect.top + buttonRect.bottom) / 2;
  const promptCenterY = (promptRect.top + promptRect.bottom) / 2;
  const nearRightEdge = buttonCenterX >= promptRect.left + promptRect.width * 0.58;
  const closeToRightEdge = Math.abs(buttonRect.right - promptRect.right) <= Math.max(180, promptRect.width * 0.28);
  const verticallyAligned = Math.abs(buttonCenterY - promptCenterY) <= Math.max(150, promptRect.height * 3);
  const sharedDepth = sharedAncestorDepth(promptBox, button, 8);
  return sharedDepth >= 0 && verticallyAligned && (nearRightEdge || closeToRightEdge);
}

function sharedAncestorDepth(first, second, maxDepth) {
  let current = first;
  for (let depth = 0; current && depth <= maxDepth; depth += 1) {
    if (containsDeep(current, second)) return depth;
    current = parentElementOrHost(current);
  }
  return -1;
}

function parentElementOrHost(element) {
  return element?.parentElement || element?.getRootNode?.().host || null;
}

function containsDeep(container, target) {
  if (!container || !target) return false;
  if (container === target || container.contains?.(target)) return true;
  let current = target;
  while (current) {
    if (current === container) return true;
    current = parentElementOrHost(current);
  }
  return false;
}

function deepTextContent(root = document) {
  const roots = [root];
  const seenRoots = new Set(roots);
  const parts = [];
  for (let index = 0; index < roots.length; index += 1) {
    const current = roots[index];
    parts.push(current.body?.innerText || current.textContent || "");
    current.querySelectorAll?.("*").forEach((element) => {
      if (element.shadowRoot && !seenRoots.has(element.shadowRoot)) {
        seenRoots.add(element.shadowRoot);
        roots.push(element.shadowRoot);
      }
    });
  }
  return parts.join(" ");
}

function uiDebugSummary() {
  const visibleButtons = queryAll(GOOGLE_AI_STUDIO_SELECTORS.generateButton)
    .filter(isVisibleElement)
    .slice(0, 8)
    .map((button) => elementLabel(button).slice(0, 48) || selectorHint(button));
  const visibleInputs = queryAll(GOOGLE_AI_STUDIO_SELECTORS.promptBox)
    .filter(isVisibleElement)
    .slice(0, 6)
    .map(selectorHint);
  return `Visible inputs: ${visibleInputs.join(", ") || "none"}. Visible buttons: ${visibleButtons.join(", ") || "none"}.`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
