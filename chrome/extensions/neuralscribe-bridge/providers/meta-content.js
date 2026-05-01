const META_SELECTORS = {
  promptBox: [
    "div[contenteditable='true'][role='textbox']",
    "div[contenteditable='true'][role='searchbox']",
    "div[contenteditable='true']",
    "[contenteditable='true']",
    "[contenteditable='plaintext-only']",
    "[data-lexical-editor='true']",
    "[role='textbox'][aria-multiline='true']",
    "[aria-label*='prompt' i]",
    "[aria-label*='describe' i]",
    "[placeholder*='prompt' i]",
    "[placeholder*='describe' i]",
    "textarea",
  ],
  generateButton: [
    "button[data-testid*='generate' i]",
    "button[aria-label*='generate' i]",
    "button[data-slot='button'][class*='bg-linear-to-r']",
    "button[type='submit']",
  ],
  media: [
    "div[data-testid='generated-video'][data-video-url]",
    "video",
    "video source",
    "img",
    "a[href*='.mp4']",
    "a[href*='.webm']",
    "a[href*='.png']",
    "a[href*='.jpg']",
    "a[href*='.jpeg']",
    "a[href*='.webp']",
    "[data-video-url]",
    "[data-src]",
  ],
  manualAction: [
    "input[type='password']",
    "input[name='email']",
    "input[name='pass']",
    "iframe[src*='captcha']",
    "[data-testid*='captcha' i]",
  ],
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "provider.meta.ping") {
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === "provider.meta.healthCheck") {
    runMetaHealthCheck(message.options || {})
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type !== "provider.meta.runJob") return false;
  runMetaJob(message.job, message.options || {})
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function runMetaHealthCheck(options = {}) {
  const promptBox = await waitForPromptBox(options.includeAdapterTest ? 10000 : 2500);
  const generateButton = promptBox ? findGenerateButton(promptBox, true) : null;
  const mediaCandidates = findMediaCandidates();
  const manualActionRequired = hasManualActionElement();
  const canExtendVideo = findExtendVideoControl();
  const healthStatus = manualActionRequired
    ? "manual_action_required"
    : promptBox
      ? "ready"
      : "needs_login";
  const message = manualActionRequired
    ? "Meta needs login, captcha, or another manual action."
    : promptBox
      ? `Meta is reachable. Prompt input ${generateButton ? "and generate controls were detected" : "was detected, generate button not yet enabled"}.`
      : "Meta prompt input was not detected. Check that this account can access Meta create.";

  const health = {
    provider: "meta",
    status: healthStatus,
    checkedAt: new Date().toISOString(),
    pageUrl: location.href,
    pageTitle: document.title,
    message,
    manualActionRequired,
    canFindPrompt: Boolean(promptBox),
    canFindGenerateButton: Boolean(generateButton),
    canDetectMedia: mediaCandidates.length > 0,
    canExtendVideo: Boolean(canExtendVideo),
    metadata: {
      mediaCandidateCount: String(mediaCandidates.length),
      includeAdapterTest: String(Boolean(options.includeAdapterTest)),
      promptDebug: promptInputDebugSummary(),
    },
  };
  return {
    health,
    capability: {
      provider: "meta",
      canGenerateImage: Boolean(promptBox) && !manualActionRequired,
      canGenerateVideo: Boolean(promptBox) && !manualActionRequired,
      canExtendVideo: Boolean(canExtendVideo),
      supportsVariants: true,
      supportsUpload: true,
      supportsDownload: true,
      metadata: {
        pageUrl: location.href,
        mediaCandidateCount: String(mediaCandidates.length),
      },
    },
  };
}

async function runMetaJob(job, options) {
  const timeoutMs = Number(options.timeoutMs || 180000);
  const requestedMediaType = job.mediaType || "image";
  let promptBox = await waitForPromptBox(30000);
  if (!promptBox) {
    if (hasManualActionElement()) {
      return manualActionResult(job, "Meta needs login or captcha before prompt input is available.");
    }
    throw new Error(`Could not find Meta prompt input. ${promptInputDebugSummary()}`);
  }

  await primeExistingMediaSnapshot();
  await ensureRequestedMode(requestedMediaType);
  promptBox = await waitForPromptBox(15000) || promptBox;

  const prompt = buildPrompt(job);
  await fillPrompt(promptBox, prompt);
  const promptReady = await waitForPromptText(promptBox, prompt, 5000);
  if (!promptReady) {
    await fillPrompt(promptBox, prompt, true);
    await waitForPromptText(promptBox, prompt, 3000);
  }

  const generateButton = await waitForGenerateButton(promptBox, requestedMediaType === "video" ? 45000 : 25000);
  if (!generateButton) {
    if (hasManualActionElement()) {
      return manualActionResult(job, "Meta needs login or captcha before generation can start.");
    }
    return manualActionResult(job, generateButtonDisabledMessage(requestedMediaType, promptBox));
  }

  const mediaBefore = captureMediaBaseline();
  const mediaObserver = createNewMediaObserver();
  let result = null;
  try {
    clickElement(generateButton);
    result = await waitForGeneratedMedia(timeoutMs, mediaBefore, requestedMediaType, prompt, mediaObserver);
  } finally {
    mediaObserver.disconnect();
  }

  if (!result) {
    if (hasManualActionElement()) {
      return manualActionResult(job, "Meta needs manual action before media is available.");
    }
    const diagnostics = mediaDebugSummary(mediaBefore, requestedMediaType, prompt);
    if (requestedMediaType === "video" && diagnostics.videoCount === 0 && diagnostics.imageCount > 0) {
      return manualActionResult(
        job,
        `Meta generated ${diagnostics.imageCount} image result(s), but this scene is configured for video. Switch Meta to video generation or retry this scene.`
      );
    }
    throw new Error(`Timed out waiting for generated media. ${diagnostics.message}`);
  }

  if (result.variants.some((variant) => isLocalObjectUrl(variant.url))) {
    result = await uploadLocalObjectVariants(job, result, options.httpBaseUrl);
  }

  return {
    status: "completed",
    mediaUrl: result.mediaUrl,
    mediaType: result.mediaType,
    mediaVariants: result.variants,
    metadata: {
      provider: "meta",
      providerPageUrl: location.href,
      variantCount: String(result.variants.length),
    },
  };
}

function manualActionResult(job, message) {
  return {
    status: "manual_action_required",
    mediaType: job.mediaType || "image",
    message,
    metadata: {
      provider: "meta",
      providerPageUrl: location.href,
    },
  };
}

function buildPrompt(job) {
  const prompt = String(job.prompt || "").trim();
  const aspectRatio = job.metadata?.aspectRatio;
  const labels = {
    "16:9": "wide landscape 16:9",
    "9:16": "vertical portrait 9:16",
    "1:1": "square 1:1",
    "4:5": "portrait 4:5",
  };
  const mediaInstruction = job.mediaType === "video"
    ? "Generate a short moving video clip, not a still image. Use real motion, cinematic camera movement, and no readable text."
    : "Generate a still image, not a video. Use no readable text.";
  const aspectInstruction = aspectRatio
    ? `Create this in ${labels[aspectRatio] || `${aspectRatio} aspect ratio`}.`
    : "";
  return `${mediaInstruction}\n\n${prompt}\n\n${aspectInstruction}`.trim();
}

async function fillPrompt(element, prompt, forceTextContent = false) {
  element.focus();
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    if (setter) setter.call(element, prompt);
    else element.value = prompt;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " " }));
    return;
  }

  element.focus();
  document.execCommand("selectAll", false);
  document.execCommand("delete", false);
  await sleep(50);
  if (forceTextContent) {
    element.textContent = prompt;
  } else {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand("insertText", false, prompt);
  }
  element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, inputType: "insertText", data: prompt }));
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " " }));
  element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " }));
  element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " " }));
}

function clickElement(element) {
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  element.click();
}

async function ensureRequestedMode(mediaType) {
  const labels = mediaType === "video"
    ? [/^video$/i, /\bvideo\b/i, /\banimate\b/i, /\bmotion\b/i]
    : [/^image$/i, /\bimage\b/i, /\bimagine\b/i];
  const control = findModeControl(labels);
  if (!control) return false;
  if (isSelectedControl(control)) return true;
  clickElement(control);
  await sleep(1200);
  return true;
}

function findModeControl(labelPatterns) {
  const controls = [
    ...document.querySelectorAll("button, [role='tab'], [role='button'], a[role='tab'], a[role='button']")
  ].filter(isVisibleElement);
  const scored = controls
    .map((element) => ({ element, score: modeControlScore(element, labelPatterns) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.element || null;
}

function findExtendVideoControl() {
  return findModeControl([
    /\bextend\b/i,
    /\bextend video\b/i,
    /\bcontinue\b/i,
    /\b10\s*second/i,
    /\b10s\b/i,
  ]);
}

function modeControlScore(element, labelPatterns) {
  if (element.disabled || element.getAttribute("aria-disabled") === "true") return 0;
  const text = normalizeText([
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.textContent,
  ].filter(Boolean).join(" "));
  if (!text || text.length > 80) return 0;
  let score = 0;
  for (const pattern of labelPatterns) {
    if (pattern.test(text)) score += pattern.source.startsWith("^") ? 50 : 20;
  }
  if (element.getAttribute("role") === "tab") score += 8;
  if (isSelectedControl(element)) score += 5;
  return score;
}

function isSelectedControl(element) {
  return (
    element.getAttribute("aria-selected") === "true" ||
    element.getAttribute("aria-pressed") === "true" ||
    element.dataset?.state === "active"
  );
}

async function waitForGenerateButton(promptBox, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const button = findGenerateButton(promptBox, true);
    if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") {
      return button;
    }
    await sleep(500);
  }
  return null;
}

function generateButtonDisabledMessage(mediaType, promptBox) {
  const buttons = findGenerateButtonCandidates(promptBox);
  const disabledCount = buttons.filter((button) =>
    button.disabled || button.getAttribute("aria-disabled") === "true"
  ).length;
  const modeText = mediaType === "video" ? " Also check that Meta is in video mode." : "";
  const promptTextLength = getPromptText(promptBox).length;
  return `Meta prompt was inserted, but the generate button was not enabled. Visible generate buttons: ${buttons.length}, disabled: ${disabledCount}, prompt text length: ${promptTextLength}.${modeText}`;
}

async function waitForGeneratedMedia(timeoutMs, baseline, requestedMediaType, prompt, mediaObserver) {
  const deadline = Date.now() + timeoutMs;
  const startedAt = Date.now();
  const found = new Map();
  let firstFoundAt = 0;
  let lastFoundAt = 0;
  const minWaitMs = requestedMediaType === "video" ? 25000 : 12000;
  const settleMs = requestedMediaType === "video" ? 8000 : 5000;

  while (Date.now() < deadline) {
    const candidates = findMediaCandidates(prompt)
      .filter((candidate) => !baseline.urls.has(candidate.url))
      .filter((candidate) => mediaObserver.hasCandidate(candidate) || candidate.promptScore > 0)
      .filter((candidate) => requestedMediaType !== "video" || candidate.mediaType === "video");

    for (const candidate of candidates) {
      if (!found.has(candidate.url)) {
        found.set(candidate.url, { ...candidate, seenAt: Date.now() });
        firstFoundAt = firstFoundAt || Date.now();
        lastFoundAt = Date.now();
      }
    }

    if (found.size > 0 && Date.now() - startedAt > minWaitMs && Date.now() - lastFoundAt > settleMs) {
      const variants = selectVariantGroup([...found.values()], requestedMediaType);
      if (variants.length > 0) {
        return {
          mediaUrl: variants[0].url,
          mediaType: variants[0].mediaType,
          variants: variants.map((variant, index) => ({
            id: `variant-${index + 1}`,
            url: variant.url,
            mediaType: variant.mediaType,
            width: variant.width || null,
            height: variant.height || null,
            source: "meta",
          })),
        };
      }
    }

    await sleep(1500);
  }

  return null;
}

function mediaDebugSummary(baseline, requestedMediaType, prompt) {
  const candidates = findMediaCandidates(prompt).filter((candidate) => !baseline.urls.has(candidate.url));
  const videoCount = candidates.filter((candidate) => candidate.mediaType === "video").length;
  const imageCount = candidates.filter((candidate) => candidate.mediaType === "image").length;
  const blobCount = candidates.filter((candidate) => isLocalObjectUrl(candidate.url)).length;
  const message = `Found ${candidates.length} new media candidate(s): ${videoCount} video, ${imageCount} image, ${blobCount} blob. Requested ${requestedMediaType}.`;
  return { candidates, videoCount, imageCount, blobCount, message };
}

function findMediaUrls() {
  return findMediaCandidates().map((candidate) => candidate.url);
}

async function primeExistingMediaSnapshot() {
  const originalX = window.scrollX;
  const originalY = window.scrollY;
  findMediaCandidates();
  window.scrollTo(0, 0);
  await sleep(500);
  findMediaCandidates();
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(1000);
  findMediaCandidates();
  window.scrollTo(originalX, originalY);
  await sleep(300);
}

function captureMediaBaseline() {
  const candidates = findMediaCandidates();
  const groupElements = new WeakSet();
  for (const candidate of candidates) {
    if (candidate.groupElement) groupElements.add(candidate.groupElement);
  }
  return {
    urls: new Set(candidates.map((candidate) => candidate.url)),
    groupElements,
  };
}

function createNewMediaObserver() {
  const mediaElements = new WeakSet();
  const mediaGroups = new WeakSet();
  const mediaSelector = META_SELECTORS.media.join(",");

  const rememberMediaElement = (element) => {
    if (!element || !(element instanceof Element)) return;
    mediaElements.add(element);
    const group = findMediaGroup(element);
    if (group) mediaGroups.add(group);
  };

  const rememberNode = (node) => {
    if (!node || !(node instanceof Element)) return;
    if (node.matches(mediaSelector)) rememberMediaElement(node);
    node.querySelectorAll?.(mediaSelector).forEach(rememberMediaElement);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach(rememberNode);
      } else if (mutation.type === "attributes") {
        rememberNode(mutation.target);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "href", "data-video-url"],
  });

  return {
    hasCandidate(candidate) {
      return Boolean(
        (candidate.element && mediaElements.has(candidate.element)) ||
        (candidate.groupElement && mediaGroups.has(candidate.groupElement))
      );
    },
    disconnect() {
      observer.disconnect();
    },
  };
}

function findMediaCandidates(prompt = "") {
  const candidates = [];
  let index = 0;
  for (const selector of META_SELECTORS.media) {
    document.querySelectorAll(selector).forEach((element) => {
      const url = extractUrl(element);
      if (!isUsableMediaUrl(url) || candidates.some((candidate) => candidate.url === url)) return;
      const rect = element.getBoundingClientRect();
      const groupElement = findMediaGroup(element);
      candidates.push({
        url,
        element,
        mediaType: inferMediaType(element, url),
        width: element.naturalWidth || element.videoWidth || rect.width || null,
        height: element.naturalHeight || element.videoHeight || rect.height || null,
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        index: index++,
        groupElement,
        groupKey: getElementPath(groupElement),
        promptScore: getPromptProximityScore(groupElement, prompt),
      });
    });
  }
  return candidates;
}

function selectVariantGroup(candidates, requestedMediaType) {
  const matching = candidates.filter((candidate) => requestedMediaType !== "video" || candidate.mediaType === "video");
  const usable = matching.length > 0 ? matching : candidates;
  const groups = new Map();
  for (const candidate of usable) {
    const group = groups.get(candidate.groupKey) || [];
    group.push(candidate);
    groups.set(candidate.groupKey, group);
  }
  const ranked = [...groups.values()].sort((a, b) => {
    const aPromptScore = Math.max(...a.map((item) => item.promptScore || 0));
    const bPromptScore = Math.max(...b.map((item) => item.promptScore || 0));
    if (aPromptScore !== bPromptScore) return bPromptScore - aPromptScore;

    const aSeenAt = Math.max(...a.map((item) => item.seenAt || 0));
    const bSeenAt = Math.max(...b.map((item) => item.seenAt || 0));
    if (aSeenAt !== bSeenAt) return bSeenAt - aSeenAt;

    if (a.length !== b.length) return b.length - a.length;

    const aScore = Math.max(...a.map((item) => item.top)) * 10 + Math.max(...a.map((item) => item.index));
    const bScore = Math.max(...b.map((item) => item.top)) * 10 + Math.max(...b.map((item) => item.index));
    return bScore - aScore;
  });

  const bestGroup = ranked[0] || [];
  const selected = bestGroup.length > 1 || usable.length <= bestGroup.length
    ? bestGroup
    : selectNewestResultWindow(usable, bestGroup);

  return uniqueCandidatesByUrl(selected.length > 0 ? selected : usable)
    .sort((a, b) => a.top - b.top || a.left - b.left || a.index - b.index)
    .slice(0, 4);
}

function selectNewestResultWindow(candidates, bestGroup) {
  const bestPromptScore = Math.max(...candidates.map((item) => item.promptScore || 0));
  const promptMatches = bestPromptScore > 0
    ? candidates.filter((item) => (item.promptScore || 0) === bestPromptScore)
    : [];
  if (promptMatches.length > bestGroup.length) return promptMatches;

  return [...candidates]
    .sort((a, b) => {
      const aSeenAt = a.seenAt || 0;
      const bSeenAt = b.seenAt || 0;
      if (aSeenAt !== bSeenAt) return bSeenAt - aSeenAt;
      if (a.top !== b.top) return b.top - a.top;
      return b.index - a.index;
    })
    .slice(0, 4);
}

function uniqueCandidatesByUrl(candidates) {
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    unique.push(candidate);
  }
  return unique;
}

async function uploadLocalObjectVariants(job, result, httpBaseUrl) {
  const baseUrl = String(httpBaseUrl || "http://127.0.0.1:8000").replace(/\/$/, "");
  const formData = new FormData();
  formData.append("mediaType", result.mediaType || job.mediaType || "image");
  formData.append("metadata", JSON.stringify({
    provider: "meta",
    providerPageUrl: location.href,
    variantCount: String(result.variants.length),
    capturedVia: "content-script-blob-upload",
  }));

  let uploadedCount = 0;
  for (const [index, variant] of result.variants.entries()) {
    const response = await fetch(variant.url);
    if (!response.ok) {
      throw new Error(`Captured ${variant.mediaType} result, but could not read blob variant ${index + 1}.`);
    }
    const blob = await response.blob();
    const extension = extensionForBlob(blob, variant.mediaType || result.mediaType || job.mediaType);
    formData.append("files", blob, `${job.id}_variant_${index + 1}.${extension}`);
    uploadedCount += 1;
  }

  if (uploadedCount === 0) {
    throw new Error("Captured generated media, but no variants were available to upload.");
  }

  const uploadResponse = await fetch(`${baseUrl}/api/generation/jobs/${encodeURIComponent(job.id)}/result/upload-variants`, {
    method: "POST",
    body: formData,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Generated blob media upload failed: ${await uploadResponse.text()}`);
  }
  const uploadedJob = await uploadResponse.json();
  return {
    status: "completed",
    mediaUrl: uploadedJob.resultUrl,
    mediaType: uploadedJob.mediaType,
    variants: uploadedJob.resultVariants || [],
    backendStored: true,
  };
}

function extensionForBlob(blob, mediaType) {
  const mime = String(blob?.type || "").toLowerCase();
  if (mime.includes("webm")) return "webm";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("mp4") || mediaType === "video") return "mp4";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpeg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

function findMediaGroup(element) {
  let current = element.parentElement;
  let fallback = current || element;
  for (let depth = 0; current && depth < 8; depth++) {
    const mediaCount = current.querySelectorAll(META_SELECTORS.media.join(",")).length;
    if (mediaCount >= 2 && mediaCount <= 6) return current;
    fallback = current;
    current = current.parentElement;
  }
  return fallback;
}

function getElementPath(element) {
  if (!element || !element.parentElement) return "document";
  const parts = [];
  let current = element;
  while (current && current !== document.body && parts.length < 5) {
    const parent = current.parentElement;
    const index = parent ? Array.prototype.indexOf.call(parent.children, current) : 0;
    parts.unshift(`${current.tagName}:${index}`);
    current = parent;
  }
  return parts.join("/");
}

function getPromptProximityScore(element, prompt) {
  const normalizedPrompt = normalizeText(prompt).slice(0, 80);
  if (!element || normalizedPrompt.length < 24) return 0;
  let current = element;
  for (let depth = 0; current && depth < 8; depth++) {
    const text = normalizeText(current.textContent || "");
    if (text.includes(normalizedPrompt) || text.includes(normalizedPrompt.slice(0, 48))) {
      return 100 - depth;
    }
    current = current.parentElement;
  }
  return 0;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function extractUrl(element) {
  return firstDownloadableUrl([
    element.dataset?.videoUrl,
    element.dataset?.src,
    element.getAttribute("data-video-url"),
    element.getAttribute("data-src"),
    element.currentSrc,
    element.poster,
    element.src,
    element.href,
    firstSrcSetUrl(element.getAttribute("srcset")),
    element.getAttribute("src"),
    element.getAttribute("href"),
    backgroundImageUrl(element),
  ]);
}

function inferMediaType(element, url) {
  if (element instanceof HTMLVideoElement || element.tagName === "SOURCE") return "video";
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return "video";
  return "image";
}

function isUsableMediaUrl(url) {
  if (!url) return false;
  if (url.startsWith("data:")) return false;
  return url.startsWith("http://") || url.startsWith("https://") || isLocalObjectUrl(url);
}

function isLocalObjectUrl(url) {
  return String(url || "").startsWith("blob:");
}

function firstDownloadableUrl(urls) {
  const cleanUrls = urls.map((url) => String(url || "").trim()).filter(Boolean);
  return cleanUrls.find((url) => url.startsWith("http://") || url.startsWith("https://") || isLocalObjectUrl(url)) || cleanUrls[0] || "";
}

function firstSrcSetUrl(srcset) {
  if (!srcset) return "";
  const firstCandidate = srcset.split(",").map((candidate) => candidate.trim()).find(Boolean);
  return firstCandidate ? firstCandidate.split(/\s+/)[0] : "";
}

async function waitForPromptBox(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const element = findPromptBox();
    if (element) return element;
    await sleep(500);
  }
  return null;
}

function findPromptBox() {
  const candidates = uniqueElements(
    META_SELECTORS.promptBox.flatMap((selector) => [...document.querySelectorAll(selector)])
  )
    .filter(isEditablePromptElement)
    .map((element) => ({ element, score: promptBoxScore(element) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.element || null;
}

function isEditablePromptElement(element) {
  if (!isVisibleElement(element)) return false;
  if (element.disabled || element.getAttribute("aria-disabled") === "true") return false;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return true;
  const editable = String(element.getAttribute("contenteditable") || "").toLowerCase();
  return editable && editable !== "false";
}

function promptBoxScore(element) {
  const rect = element.getBoundingClientRect();
  if (rect.width < 120 || rect.height < 16) return 0;
  const label = normalizeText([
    element.getAttribute("aria-label"),
    element.getAttribute("aria-placeholder"),
    element.getAttribute("placeholder"),
    element.getAttribute("role"),
    element.getAttribute("data-testid"),
    element.getAttribute("title"),
    element.dataset?.lexicalEditor ? "lexical editor" : "",
    nearbyPromptText(element),
  ].filter(Boolean).join(" "));
  let score = 10;
  if (/\b(textbox|searchbox)\b/.test(label)) score += 12;
  if (/\b(prompt|describe|imagine|create|message)\b/.test(label)) score += 24;
  if (element instanceof HTMLTextAreaElement) score += 12;
  if (String(element.getAttribute("contenteditable") || "").toLowerCase() !== "false") score += 10;
  if (element.dataset?.lexicalEditor === "true") score += 14;
  score += Math.min(20, rect.width / 40);
  score += Math.min(10, rect.height / 12);
  const viewportCenter = window.innerHeight / 2;
  score += Math.max(0, 18 - Math.abs(rect.top - viewportCenter) / 40);
  return score;
}

function nearbyPromptText(element) {
  const parts = [];
  let current = element;
  for (let depth = 0; current && depth < 4; depth += 1) {
    parts.push(current.textContent || "");
    current = current.parentElement;
  }
  return parts.join(" ").slice(0, 300);
}

function promptInputDebugSummary() {
  const editors = uniqueElements(
    [
      ...document.querySelectorAll("[contenteditable], textarea, input, [role='textbox'], [data-lexical-editor='true']"),
    ]
  )
    .filter(isVisibleElement)
    .slice(0, 8)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const label = normalizeText([
        element.tagName,
        element.getAttribute("role"),
        element.getAttribute("aria-label"),
        element.getAttribute("placeholder"),
        element.getAttribute("contenteditable"),
        element.textContent,
      ].filter(Boolean).join(" "));
      return `${label.slice(0, 90)} @ ${Math.round(rect.width)}x${Math.round(rect.height)}`;
    });
  const buttons = [...document.querySelectorAll("button")]
    .filter(isVisibleElement)
    .slice(0, 10)
    .map((button) => normalizeText([
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      button.textContent,
    ].filter(Boolean).join(" ")).slice(0, 50))
    .filter(Boolean);
  const bodyHint = normalizeText(document.body?.innerText || "").slice(0, 240);
  return `URL: ${location.href}. Title: ${document.title || "untitled"}. Visible editors: ${editors.join(" | ") || "none"}. Buttons: ${buttons.join(" | ") || "none"}. Page text: ${bodyHint}`;
}

async function waitForPromptText(element, prompt, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (promptTextMatches(getPromptText(element), prompt)) return true;
    await sleep(250);
  }
  return promptTextMatches(getPromptText(element), prompt);
}

function getPromptText(element) {
  if (!element) return "";
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return String(element.value || "");
  }
  return String(element.innerText || element.textContent || "");
}

function promptTextMatches(value, prompt) {
  const text = normalizeText(value);
  const expected = normalizeText(prompt);
  if (!expected) return text.length > 0;
  if (text.includes(expected.slice(0, Math.min(60, expected.length)))) return true;
  const keywords = expected.split(" ").filter((word) => word.length > 4).slice(0, 8);
  if (keywords.length === 0) return false;
  const matches = keywords.filter((word) => text.includes(word)).length;
  return matches >= Math.min(4, keywords.length);
}

function findGenerateButton(promptBox, enabledOnly = false) {
  const candidates = findGenerateButtonCandidates(promptBox)
    .filter((button) => !enabledOnly || (!button.disabled && button.getAttribute("aria-disabled") !== "true"))
    .map((button) => ({ button, score: generateButtonScore(button, promptBox) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.button || null;
}

function findGenerateButtonCandidates(promptBox) {
  const selectorMatches = META_SELECTORS.generateButton
    .flatMap((selector) => [...document.querySelectorAll(selector)]);
  const scoredButtons = [...document.querySelectorAll("button")]
    .filter((button) => generateButtonScore(button, promptBox) > 0);
  return uniqueElements([...selectorMatches, ...scoredButtons]).filter(isVisibleElement);
}

function generateButtonScore(button, promptBox) {
  if (!isVisibleElement(button)) return 0;
  const text = normalizeText([
    button.getAttribute("aria-label"),
    button.getAttribute("title"),
    button.getAttribute("type"),
    button.getAttribute("data-testid"),
    button.textContent,
  ].filter(Boolean).join(" "));
  if (/\b(download|share|copy|close|cancel|delete|remove|like|dislike|menu|settings|profile|login|log in|sign in)\b/.test(text)) {
    return 0;
  }

  let score = 0;
  if (/\b(generate|create|submit|send|imagine)\b/.test(text)) score += 55;
  if (button.getAttribute("type") === "submit") score += 24;
  if (button.matches(META_SELECTORS.generateButton.join(","))) score += 20;
  if (button.querySelector("svg")) score += 8;
  if (String(button.className || "").includes("bg-linear-to-r")) score += 12;

  if (promptBox) {
    const promptRect = promptBox.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const sharedDepth = sharedAncestorDepth(promptBox, button, 7);
    if (sharedDepth >= 0) score += Math.max(0, 42 - sharedDepth * 5);
    const verticalDistance = Math.abs((buttonRect.top + buttonRect.bottom) / 2 - (promptRect.top + promptRect.bottom) / 2);
    const horizontalDistance = Math.abs((buttonRect.left + buttonRect.right) / 2 - promptRect.right);
    if (verticalDistance < Math.max(120, promptRect.height * 2.5)) score += 20;
    if (horizontalDistance < Math.max(220, promptRect.width * 0.35)) score += 12;
    if (buttonRect.left >= promptRect.left - 16 && buttonRect.top >= promptRect.top - 80) score += 8;
  }

  return score;
}

function sharedAncestorDepth(first, second, maxDepth) {
  let current = first;
  for (let depth = 0; current && depth <= maxDepth; depth++) {
    if (current.contains(second)) return depth;
    current = current.parentElement;
  }
  return -1;
}

function uniqueElements(elements) {
  return [...new Set(elements.filter(Boolean))];
}

async function waitForElement(selectors, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const element = findFirst(selectors);
    if (element) return element;
    await sleep(500);
  }
  return null;
}

function findFirst(selectors, visibleOnly = false) {
  for (const selector of selectors) {
    const element = [...document.querySelectorAll(selector)]
      .find((candidate) => !visibleOnly || isVisibleElement(candidate));
    if (element) return element;
  }
  return null;
}

function backgroundImageUrl(element) {
  const value = window.getComputedStyle(element).backgroundImage || "";
  const match = value.match(/url\((['"]?)(.*?)\1\)/);
  return match ? match[2] : "";
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

function hasManualActionElement() {
  return Boolean(findFirst(META_SELECTORS.manualAction));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
