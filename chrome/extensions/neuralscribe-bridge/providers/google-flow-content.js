const GOOGLE_FLOW_PROVIDER = "google_flow";

const GOOGLE_FLOW_SELECTORS = {
  promptBox: [
    "textarea",
    "textarea[aria-label*='prompt' i]",
    "textarea[placeholder*='prompt' i]",
    "textarea[aria-label*='describe' i]",
    "textarea[placeholder*='describe' i]",
    "input[type='text'][aria-label*='prompt' i]",
    "input[type='text'][placeholder*='prompt' i]",
    "input[type='text'][aria-label*='describe' i]",
    "input[type='text'][placeholder*='describe' i]",
    "[contenteditable='true'][role='textbox']",
    "[contenteditable='true'][aria-label*='prompt' i]",
    "[contenteditable='true'][aria-label*='describe' i]",
    "[contenteditable='true']",
    "[role='textbox']",
    "[aria-label*='prompt' i]",
    "[data-testid*='prompt' i]",
  ],
  generateButton: [
    "button",
    "[role='button']",
  ],
  media: [
    "video",
    "video[src]",
    "video source[src]",
    "source[src][type*='video' i]",
    "img[src]",
    "img[srcset]",
    "source[srcset]",
    "a[href*='.mp4' i]",
    "a[href*='.webm' i]",
    "a[href*='.mov' i]",
    "a[href*='.png' i]",
    "a[href*='.jpg' i]",
    "a[href*='.jpeg' i]",
    "a[href*='.webp' i]",
    "a[href^='blob:']",
    "a[href^='data:image']",
    "a[href^='data:video']",
    "a[download]",
    "[data-video-url]",
    "[data-image-url]",
    "[style*='background']",
  ],
  manualAction: [
    "input[type='password']",
    "input[type='email']",
    "iframe[src*='captcha' i]",
    "[data-testid*='captcha' i]",
    "[aria-label*='captcha' i]",
  ],
  workspaceLinks: [
    "a[href*='/fx/tools/flow/project/']",
    "a[href*='/flow/project/']",
    "a[href*='/tools/flow/project/']",
  ],
  workspaceButtons: [
    "button",
    "[role='button']",
  ],
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "provider.google_flow.ping") {
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === "provider.google_flow.healthCheck") {
    runGoogleFlowHealthCheck()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "provider.google_flow.adapterTest") {
    runGoogleFlowAdapterTest(message.options || {})
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type !== "provider.google_flow.runJob") return false;
  runGoogleFlowJob(message.job, message.options || {})
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function runGoogleFlowHealthCheck() {
  const prepared = await prepareGoogleFlowWorkspace({ allowNavigation: true, timeoutMs: 8000 });
  const promptBox = prepared.promptBox || await waitForPromptBox(2500);
  const generateButton = findGenerateButton(promptBox);
  const mediaCandidates = findMediaCandidates();
  const manualActionRequired = hasManualActionElement();
  const status = manualActionRequired
    ? "manual_action_required"
    : promptBox
      ? "ready"
      : "needs_login";
  return {
    health: {
      provider: GOOGLE_FLOW_PROVIDER,
      status,
      checkedAt: new Date().toISOString(),
      pageUrl: location.href,
      pageTitle: document.title,
      message: manualActionRequired
        ? "Google Flow needs login, captcha, or another manual action."
        : promptBox
          ? "Google Flow prompt controls were detected."
          : "Google Flow prompt input was not detected.",
      manualActionRequired,
      canFindPrompt: Boolean(promptBox),
      canFindGenerateButton: Boolean(generateButton),
      canDetectMedia: mediaCandidates.length > 0,
      canExtendVideo: false,
      metadata: {
        mediaCandidateCount: String(mediaCandidates.length),
        promptSelector: promptBox ? selectorHint(promptBox) : "",
        generateButtonSelector: generateButton ? selectorHint(generateButton) : "",
        generateButtonLabel: generateButton ? elementLabel(generateButton).slice(0, 120) : "",
        workspaceAction: prepared.action || "",
        uiSummary: uiDebugSummary(),
      },
    },
    capability: {
      provider: GOOGLE_FLOW_PROVIDER,
      canGenerateImage: Boolean(promptBox) && !manualActionRequired,
      canGenerateVideo: Boolean(promptBox) && !manualActionRequired,
      canGenerateAudio: false,
      canExtendVideo: false,
      supportsVariants: true,
      supportsUpload: true,
      supportsDownload: true,
      metadata: {
        pageUrl: location.href,
      },
    },
  };
}

async function runGoogleFlowJob(job, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 300000);
  const mediaPlan = resolveFlowMediaPlan(job);
  const requestedMediaType = mediaPlan.mediaType;
  const prepared = await prepareGoogleFlowWorkspace({ allowNavigation: true, timeoutMs: 45000 });
  let promptBox = prepared.promptBox || await waitForPromptBox(10000);
  if (!promptBox) {
    if (hasManualActionElement()) {
      return manualActionResult("Google Flow needs login or manual action before generation can start.");
    }
    throw new Error(`Could not find Google Flow prompt input. ${uiDebugSummary()}`);
  }

  const modeResult = await configureGoogleFlowGenerationMode(requestedMediaType, job.metadata?.aspectRatio, promptBox);
  promptBox = await waitForPromptBox(10000) || promptBox;
  const prompt = buildPrompt(job);
  await fillPrompt(promptBox, prompt);
  await waitForPromptText(promptBox, prompt, 4000);
  const generateButton = await waitForGenerateButton(15000, promptBox);
  if (!generateButton) {
    return manualActionResult(`Google Flow generate button was not detected or is disabled. ${uiDebugSummary()}`);
  }

  const beforeCandidates = findMediaCandidates({ mediaType: requestedMediaType });
  const before = new Set(beforeCandidates.map((candidate) => candidate.url));
  clickElement(generateButton);
  const media = await waitForNewMedia(before, timeoutMs, requestedMediaType);
  if (!media) {
    if (hasManualActionElement()) {
      return manualActionResult("Google Flow needs manual action before generated media is available.");
    }
    throw new Error(`Timed out waiting for generated Google Flow media. ${uiDebugSummary()}`);
  }

  const capture = await captureMediaResult(job, media, options.httpBaseUrl, {
    adapterTestId: options.adapterTestId || "",
  });
  const mediaUrl = capture.mediaUrl;
  const localPath = capture.localPath;

  return {
    status: "completed",
    mediaUrl,
    mediaType: media.mediaType,
    mediaVariants: [{
      id: "google-flow-1",
      url: mediaUrl,
      mediaType: media.mediaType,
      localPath,
      source: localPath ? "backend" : "provider",
    }],
    metadata: {
      provider: GOOGLE_FLOW_PROVIDER,
      providerPageUrl: location.href,
      capturedVia: capture.capturedVia,
      mediaUrlKind: capture.mediaUrlKind,
      requestedMediaType,
      workspaceAction: prepared.action || "",
      mediaCandidateCountBefore: String(beforeCandidates.length),
      mediaCandidateCountAfter: String(findMediaCandidates({ mediaType: requestedMediaType }).length),
      resultSelector: selectorHint(media.element),
      flowMediaMode: requestedMediaType,
      mediaTypeFallbackReason: mediaPlan.fallbackReason,
      modeAction: modeResult.action,
    },
  };
}

async function runGoogleFlowAdapterTest(options = {}) {
  const submitFullTest = Boolean(options.submitFullTest);
  const testPrompt = String(
    options.fullTestPrompt || "Create a cinematic five-second vertical video of a glowing neural network forming a play button."
  ).trim();
  const mediaType = options.mediaType === "image" ? "image" : "video";
  const base = await runGoogleFlowHealthCheck();
  const prepared = await prepareGoogleFlowWorkspace({ allowNavigation: true, timeoutMs: 20000 });
  const promptBox = prepared.promptBox || await waitForPromptBox(10000);
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
      throw new Error(`Full Google Flow adapter test could not insert the prompt. ${uiDebugSummary()}`);
    }
    if (!generateButton) {
      throw new Error(`Full Google Flow adapter test could not find an enabled generate button. ${uiDebugSummary()}`);
    }
    result = await runGoogleFlowJob(
      {
        id: options.adapterTestId || `adapter-test-${Date.now()}`,
        sceneId: "adapter-test",
        projectId: "",
        provider: GOOGLE_FLOW_PROVIDER,
        mediaType,
        prompt: testPrompt,
        negativePrompt: "",
        metadata: {
          jobType: "adapter_test",
          aspectRatio: "9:16",
        },
      },
      {
        timeoutMs: 300000,
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
    ? `Full Google Flow adapter test ${result?.mediaUrl ? "generated media successfully" : "completed"}.`
    : `Safe Google Flow adapter test ${promptInserted ? "inserted prompt" : "could not insert prompt"} and ${generateButton ? "found generate button" : "did not find generate button"}.`;

  return {
    health: {
      ...base.health,
      status,
      message,
      canFindPrompt: Boolean(promptBox),
      canFindGenerateButton: Boolean(generateButton),
      canDetectMedia: base.health.canDetectMedia || Boolean(result?.mediaUrl),
      metadata: {
        ...base.health.metadata,
        adapterTest: "true",
        adapterTestId: options.adapterTestId || "",
        submitFullTest: String(submitFullTest),
        promptInserted: String(promptInserted),
        generateButtonFound: String(Boolean(generateButton)),
        workspaceAction: prepared.action || "",
        adapterResultUrl: result?.mediaUrl || "",
        adapterVariantCount: String(result?.mediaVariants?.length || 0),
        uiSummary: uiDebugSummary(),
      },
    },
    capability: {
      ...base.capability,
      canGenerateImage: Boolean(promptBox) && !base.health.manualActionRequired,
      canGenerateVideo: Boolean(promptBox) && !base.health.manualActionRequired,
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
  const lines = [String(job.prompt || "").trim()].filter(Boolean);
  if (job.metadata?.aspectRatio) lines.push(`Aspect ratio: ${job.metadata.aspectRatio}.`);
  if (job.metadata?.durationSeconds) lines.push(`Duration: ${job.metadata.durationSeconds} seconds.`);
  if (job.negativePrompt) lines.push(`Avoid: ${job.negativePrompt}.`);
  return lines.join("\n").trim();
}

function resolveFlowMediaPlan(job) {
  if (job.mediaType === "image") {
    return { mediaType: "image", fallbackReason: "" };
  }
  if (job.metadata?.flowGenerationMode === "video_frames" || job.metadata?.startImageUrl) {
    return { mediaType: "video", fallbackReason: "" };
  }
  return {
    mediaType: "image",
    fallbackReason: "google_flow_text_video_requires_start_or_end_frames",
  };
}

async function configureGoogleFlowGenerationMode(mediaType, aspectRatio, promptBox) {
  const modeButton = findGenerationSettingsButton(promptBox);
  if (!modeButton) return { action: "mode_button_not_found" };

  const actions = [];
  clickElement(modeButton);
  await sleep(500);

  if (clickGenerationOption(mediaType === "image" ? /(?:^|\s)image$/i : /(?:^|\s)video$/i, promptBox)) {
    actions.push(mediaType);
    await sleep(350);
  }

  const normalizedAspectRatio = normalizeAspectRatio(aspectRatio);
  if (normalizedAspectRatio && clickGenerationOption(new RegExp(`(?:^|\\s)${escapeRegex(normalizedAspectRatio)}$`, "i"), promptBox)) {
    actions.push(normalizedAspectRatio);
    await sleep(250);
  }

  if (clickGenerationOption(/(?:^|\s)1x$/i, promptBox)) {
    actions.push("1x");
    await sleep(150);
  }

  closeGenerationSettings(promptBox);
  return { action: actions.join(",") || "opened_mode_menu" };
}

function findGenerationSettingsButton(promptBox) {
  const candidates = queryAll(["button", "[role='button']"])
    .filter((button) => isVisibleElement(button) && !isDisabledControl(button))
    .map((button) => ({ button, score: scoreGenerationSettingsButton(button, promptBox) }))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score);
  return candidates[0]?.button || null;
}

function scoreGenerationSettingsButton(button, promptBox) {
  const label = elementLabel(button);
  let score = 0;
  if (/crop_(?:16_9|9_16|landscape|portrait|square)|\b(?:16:9|9:16|4:3|3:4|1:1|1x|x2|x3|x4)\b/i.test(label)) score += 12;
  if (/veo|nano banana|banana|image|video/i.test(label)) score += 6;
  if (/create|add_2|arrow_forward|agent|settings|instructions|help|filter|sort|profile|media/i.test(label)) score -= 8;
  if (promptBox && isNearPromptSubmitPosition(button, promptBox)) score += 6;
  return score;
}

function clickGenerationOption(labelPattern, promptBox) {
  const options = queryAll(["[role='tab']", "button", "[role='button']"])
    .filter((element) => isVisibleElement(element) && !isDisabledControl(element))
    .map((element) => ({ element, label: elementLabel(element), distance: distanceFromPrompt(element, promptBox) }))
    .filter(({ label }) => labelPattern.test(label))
    .sort((first, second) => first.distance - second.distance);
  if (!options[0]) return false;
  clickElement(options[0].element);
  return true;
}

function normalizeAspectRatio(aspectRatio) {
  const value = String(aspectRatio || "").trim();
  if (/9\s*:\s*16/.test(value)) return "9:16";
  if (/16\s*:\s*9/.test(value)) return "16:9";
  if (/4\s*:\s*3/.test(value)) return "4:3";
  if (/3\s*:\s*4/.test(value)) return "3:4";
  if (/1\s*:\s*1/.test(value)) return "1:1";
  return "";
}

function closeGenerationSettings(promptBox) {
  const eventOptions = { key: "Escape", code: "Escape", bubbles: true, cancelable: true };
  document.dispatchEvent(new KeyboardEvent("keydown", eventOptions));
  document.dispatchEvent(new KeyboardEvent("keyup", eventOptions));
  promptBox?.focus?.();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function prepareGoogleFlowWorkspace(options = {}) {
  const timeoutMs = Number(options.timeoutMs || 30000);
  const allowNavigation = options.allowNavigation !== false;
  const startedAt = Date.now();
  let action = "";

  while (Date.now() - startedAt < timeoutMs) {
    dismissFlowOverlays();

    const promptBox = findPromptBox();
    if (promptBox) {
      return { promptBox, action };
    }

    if (allowNavigation && !action) {
      const entry = findWorkspaceEntryAction();
      if (entry) {
        action = entry.action;
        clickElement(entry.element);
        await sleep(2500);
        continue;
      }
    }

    await sleep(300);
  }

  return { promptBox: null, action };
}

function findWorkspaceEntryAction() {
  const projectLink = queryAll(GOOGLE_FLOW_SELECTORS.workspaceLinks)
    .filter((element) => isVisibleElement(element))
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0)
    .sort((first, second) => first.rect.top - second.rect.top)[0]?.element;
  if (projectLink) {
    return { element: projectLink, action: "open_existing_project" };
  }

  const buttons = queryAll(GOOGLE_FLOW_SELECTORS.workspaceButtons)
    .filter((element) => isVisibleElement(element) && !isDisabledControl(element))
    .map((element) => ({ element, label: elementLabel(element) }))
    .filter(({ label }) => /new project|get started|create project|start project|create$/i.test(label))
    .filter(({ label }) => !/agent|help|delete|edit|profile|tv|banner|learn/i.test(label));
  const newProjectButton = buttons[0]?.element || null;
  if (newProjectButton) {
    return { element: newProjectButton, action: "create_or_enter_project" };
  }

  return null;
}

function dismissFlowOverlays() {
  const labels = [
    /^(got it|done|close|dismiss|skip|maybe later|not now)$/i,
    /^(continue|next)$/i,
  ];
  const buttons = queryAll(["button", "[role='button']", "[aria-label]"])
    .filter((element) => isVisibleElement(element) && !isDisabledControl(element))
    .filter((element) => labels.some((pattern) => pattern.test(elementLabel(element))));
  buttons.slice(0, 2).forEach((button) => clickElement(button));
}

async function waitForPromptBox(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const box = findPromptBox();
    if (box) return box;
    await sleep(250);
  }
  return null;
}

function findPromptBox() {
  const candidates = queryAll(GOOGLE_FLOW_SELECTORS.promptBox)
    .filter((element) => isVisibleElement(element) && isEditableTextElement(element))
    .map((element) => ({ element, score: scorePromptBox(element) }))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score);
  return candidates[0]?.element || null;
}

function scorePromptBox(element) {
  const label = elementLabel(element);
  let score = 0;
  if (element.matches?.("textarea")) score += 10;
  if (element.matches?.("[contenteditable='true']")) score += 8;
  if (element.matches?.("[role='textbox']")) score += 7;
  if (/prompt|describe|image|video|scene|flow|idea/i.test(label)) score += 8;
  if (/search|filter|email|password|name/i.test(label)) score -= 12;
  const rect = element.getBoundingClientRect();
  if (rect.width >= 240) score += 4;
  if (rect.height >= 32) score += 2;
  return score;
}

function findGenerateButton(promptBox = null) {
  const buttons = queryAll(GOOGLE_FLOW_SELECTORS.generateButton)
    .filter((button) => isVisibleElement(button) && !isDisabledControl(button))
    .map((button) => ({ button, score: scoreGenerateButton(button, promptBox) }))
    .filter((item) => item.score >= 6)
    .sort((first, second) => second.score - first.score);
  return buttons[0]?.button || null;
}

function scoreGenerateButton(button, promptBox) {
  const label = elementLabel(button);
  let score = 0;
  if (/add_2|crop_(?:16_9|9_16|landscape|portrait|square)|\b(?:16:9|9:16|4:3|3:4|1:1|1x|x2|x3|x4)\b|veo|nano banana|banana|frames|ingredients|agent instructions|settings|sort|filter/i.test(label)) score -= 30;
  if (/^(image|video)$/i.test(label.replace(/^(image|play_circle)\s+/i, ""))) score -= 30;
  if (/generate|create|submit|send|run|make|flow|video|image|render/i.test(label)) score += 12;
  if (/download|share|copy|close|cancel|delete|remove|like|dislike|menu|settings|profile|login|sign in|sign out/i.test(label)) score -= 30;
  if (/arrow_forward/i.test(label)) score += 12;
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

function findMediaCandidates(options = {}) {
  const requestedMediaType = options.mediaType || "";
  const candidates = [];
  queryAll(GOOGLE_FLOW_SELECTORS.media).forEach((element) => {
    const url = mediaUrlFromElement(element);
    if (!url) return;
    const mediaType = classifyMediaType(url, element, requestedMediaType);
    if (!mediaType) return;
    if (requestedMediaType && mediaType !== requestedMediaType) return;
    if (!isUsableMediaCandidate(element, mediaType, url)) return;
    candidates.push({ url, element, mediaType });
  });
  return dedupeCandidates(candidates);
}

async function waitForNewMedia(before, timeoutMs, requestedMediaType) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const candidate = findMediaCandidates({ mediaType: requestedMediaType })
      .find((item) => !before.has(item.url));
    if (candidate) {
      await waitForMediaReady(candidate.element, candidate.mediaType);
      return candidate;
    }
    await sleep(1000);
  }
  return null;
}

async function fillPrompt(element, value) {
  const target = editableTextTarget(element);
  target.scrollIntoView({ block: "center", inline: "nearest" });
  target.focus();
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    setNativeValue(target, value);
    dispatchTextChangeEvents(target, value);
    return;
  }

  if (target.isContentEditable || target.getAttribute?.("role") === "textbox") {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand?.("delete", false);
    dispatchPasteText(target, value);
    await sleep(50);
    if (normalizeText(readElementText(target)) !== normalizeText(value)) {
      const inserted = document.execCommand?.("insertText", false, value);
      if (!inserted) {
        target.textContent = value;
      }
    }
    dispatchTextChangeEvents(target, value);
    return;
  }

  target.textContent = value;
  dispatchTextChangeEvents(target, value);
}

function editableTextTarget(element) {
  if (!element) return document.body;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element;
  if (element.isContentEditable || element.getAttribute?.("role") === "textbox") return element;
  return element.querySelector?.("textarea, input[type='text'], [contenteditable='true'], [role='textbox']") || element;
}

function dispatchPasteText(element, value) {
  try {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    element.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: data,
    }));
  } catch {
    // ClipboardEvent/DataTransfer support differs across Chromium extension worlds.
  }
}

function dispatchTextChangeEvents(element, value) {
  const inputOptions = { bubbles: true, cancelable: true, inputType: "insertText", data: value };
  const eventTargets = [element, element.parentElement, element.closest?.("[role='textbox']")].filter(Boolean);
  uniqueElements(eventTargets).forEach((target) => {
    try {
      target.dispatchEvent(new InputEvent("beforeinput", inputOptions));
    } catch {
      target.dispatchEvent(new Event("beforeinput", { bubbles: true, cancelable: true }));
    }
    try {
      target.dispatchEvent(new InputEvent("input", inputOptions));
    } catch {
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
    target.dispatchEvent(new Event("change", { bubbles: true }));
    target.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
    target.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }));
  });
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

async function captureMediaResult(job, media, httpBaseUrl, options = {}) {
  const mediaUrlKind = classifyMediaUrl(media.url);
  try {
    const metadata = {
      capturedVia: isLocalObjectUrl(media.url) ? "content-script-blob-upload" : "content-script-fetch-upload",
      mediaUrlKind,
    };
    const uploaded = options.adapterTestId
      ? await uploadAdapterTestMediaFromUrl(options.adapterTestId, media.url, media.mediaType, httpBaseUrl)
      : await uploadMediaFromUrl(job, media.url, media.mediaType, httpBaseUrl, metadata);
    return {
      mediaUrl: uploaded.resultUrl,
      localPath: uploaded.localPath || "",
      capturedVia: isLocalObjectUrl(media.url) ? "content-script-blob-upload" : "content-script-fetch-upload",
      mediaUrlKind,
    };
  } catch (error) {
    if (isLocalObjectUrl(media.url) || String(media.url || "").startsWith("data:")) {
      throw error;
    }
    return {
      mediaUrl: media.url,
      localPath: "",
      capturedVia: "provider-url",
      mediaUrlKind,
    };
  }
}

async function uploadAdapterTestMediaFromUrl(testId, mediaUrl, mediaType, httpBaseUrl) {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error("Captured Google Flow adapter media, but could not read it.");
  }
  const blob = await response.blob();
  const extension = extensionFromBlob(blob, mediaType);
  const formData = new FormData();
  formData.append("files", blob, `${testId}.${extension}`);
  const baseUrl = String(httpBaseUrl || "http://127.0.0.1:8000").replace(/\/$/, "");
  const uploadResponse = await fetch(`${baseUrl}/api/browser-bridge/adapter-tests/${encodeURIComponent(testId)}/media`, {
    method: "POST",
    body: formData,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Adapter media upload failed: ${await uploadResponse.text()}`);
  }
  const payload = await uploadResponse.json();
  return {
    resultUrl: payload.resultUrl,
    localPath: "",
  };
}

async function uploadMediaFromUrl(job, mediaUrl, mediaType, httpBaseUrl, metadata = {}) {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error("Captured Google Flow media blob, but could not read it.");
  }
  const blob = await response.blob();
  const extension = extensionFromBlob(blob, mediaType);
  const formData = new FormData();
  formData.append("mediaType", mediaType);
  formData.append("metadata", JSON.stringify({
    provider: GOOGLE_FLOW_PROVIDER,
    providerPageUrl: location.href,
    ...metadata,
  }));
  formData.append("file", blob, `${job.id}.${extension}`);
  const baseUrl = String(httpBaseUrl || "http://127.0.0.1:8000").replace(/\/$/, "");
  const uploadResponse = await fetch(`${baseUrl}/api/generation/jobs/${encodeURIComponent(job.id)}/result/upload`, {
    method: "POST",
    body: formData,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Generated media upload failed: ${await uploadResponse.text()}`);
  }
  return uploadResponse.json();
}

function manualActionResult(message) {
  return {
    status: "manual_action_required",
    message,
    metadata: {
      provider: GOOGLE_FLOW_PROVIDER,
      providerPageUrl: location.href,
      uiSummary: uiDebugSummary(),
    },
  };
}

function hasManualActionElement() {
  if (queryFirst(GOOGLE_FLOW_SELECTORS.manualAction, true)) return true;
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
    element.getAttribute?.("download") || "",
    element.innerText || element.textContent || "",
  ].join(" "));
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function mediaUrlFromElement(element) {
  if (!element) return "";
  const dataVideo = element.getAttribute?.("data-video-url");
  if (dataVideo) return dataVideo;
  const dataImage = element.getAttribute?.("data-image-url");
  if (dataImage) return dataImage;
  const srcset = element.getAttribute?.("srcset");
  if (srcset) return parseSrcsetUrl(srcset);
  const direct = element.currentSrc ||
    element.src ||
    element.href ||
    element.getAttribute?.("src") ||
    element.getAttribute?.("href") ||
    "";
  if (direct) return direct;
  return backgroundImageUrl(element);
}

function parseSrcsetUrl(srcset) {
  const candidates = String(srcset || "")
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0])
    .filter(Boolean);
  return candidates[candidates.length - 1] || "";
}

function backgroundImageUrl(element) {
  const value = window.getComputedStyle(element).backgroundImage || "";
  const match = value.match(/url\((['"]?)(.*?)\1\)/);
  return match ? match[2] : "";
}

function classifyMediaType(url, element, requestedMediaType = "") {
  const value = String(url || "");
  const type = element.getAttribute?.("type") || "";
  if (requestedMediaType && (value.startsWith("blob:") || value.startsWith("data:"))) return requestedMediaType;
  if (element instanceof HTMLVideoElement || /video/i.test(type)) return "video";
  if (element instanceof HTMLImageElement) return "image";
  if (value.startsWith("data:video") || /\.(mp4|webm|mov)(\?|#|$)/i.test(value)) return "video";
  if (value.startsWith("data:image") || /\.(png|jpg|jpeg|webp|gif)(\?|#|$)/i.test(value)) return "image";
  if (requestedMediaType && /download|result|media|asset/i.test(elementLabel(element))) return requestedMediaType;
  return "";
}

function isUsableMediaCandidate(element, mediaType, url) {
  if (!isVisibleElement(element) && !String(url || "").startsWith("blob:") && !String(url || "").startsWith("data:")) {
    return false;
  }
  if (mediaType === "image" && element instanceof HTMLImageElement) {
    const width = element.naturalWidth || element.getBoundingClientRect().width;
    const height = element.naturalHeight || element.getBoundingClientRect().height;
    if (width > 0 && height > 0 && (width < 96 || height < 96)) return false;
  }
  if (/logo|avatar|profile|icon|favicon/i.test(`${url} ${elementLabel(element)}`)) return false;
  return true;
}

async function waitForMediaReady(element, mediaType) {
  if (mediaType !== "video") return;
  const video = element instanceof HTMLVideoElement ? element : element.closest?.("video");
  if (!(video instanceof HTMLVideoElement)) return;
  if (video.readyState >= 2 || Number.isFinite(video.duration)) return;
  await new Promise((resolve) => {
    const timeoutId = window.setTimeout(resolve, 3000);
    video.addEventListener("loadedmetadata", () => {
      window.clearTimeout(timeoutId);
      resolve();
    }, { once: true });
  });
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

function classifyMediaUrl(url) {
  const value = String(url || "");
  if (value.startsWith("blob:")) return "blob";
  if (value.startsWith("data:")) return "data";
  if (value.startsWith("http://") || value.startsWith("https://")) return "remote";
  return "other";
}

function extensionFromBlob(blob, fallbackMediaType) {
  const type = String(blob?.type || "").toLowerCase();
  if (type.includes("webm")) return "webm";
  if (type.includes("quicktime")) return "mov";
  if (type.includes("mp4")) return "mp4";
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  return fallbackMediaType === "video" ? "mp4" : "png";
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

function distanceFromPrompt(element, promptBox) {
  if (!promptBox) return 0;
  const promptRect = promptBox.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const promptCenterX = (promptRect.left + promptRect.right) / 2;
  const promptCenterY = (promptRect.top + promptRect.bottom) / 2;
  const elementCenterX = (rect.left + rect.right) / 2;
  const elementCenterY = (rect.top + rect.bottom) / 2;
  return Math.hypot(elementCenterX - promptCenterX, elementCenterY - promptCenterY);
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
  const visibleButtons = queryAll(GOOGLE_FLOW_SELECTORS.generateButton)
    .filter(isVisibleElement)
    .slice(0, 8)
    .map((button) => elementLabel(button).slice(0, 48) || selectorHint(button));
  const visibleInputs = queryAll(GOOGLE_FLOW_SELECTORS.promptBox)
    .filter(isVisibleElement)
    .slice(0, 6)
    .map(selectorHint);
  return `Visible inputs: ${visibleInputs.join(", ") || "none"}. Visible buttons: ${visibleButtons.join(", ") || "none"}.`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
