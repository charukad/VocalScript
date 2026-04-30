const META_SELECTORS = {
  promptBox: [
    "div[contenteditable='true'][role='textbox']",
    "div[contenteditable='true'][role='searchbox']",
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
    "video[src]",
    "video source[src]",
    "img[src^='blob:']",
    "img[src^='https://']",
    "a[href*='.mp4']",
    "a[href*='.webm']",
    "a[href*='.png']",
    "a[href*='.jpg']",
    "a[href*='.jpeg']",
    "a[href*='.webp']",
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
  if (message?.type !== "provider.meta.runJob") return false;
  runMetaJob(message.job, message.options || {})
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function runMetaJob(job, options) {
  const timeoutMs = Number(options.timeoutMs || 180000);
  const promptBox = await waitForElement(META_SELECTORS.promptBox, 30000);
  if (!promptBox) {
    if (hasManualActionElement()) {
      return manualActionResult(job, "Meta needs login or captcha before prompt input is available.");
    }
    throw new Error("Could not find Meta prompt input.");
  }

  await primeExistingMediaSnapshot();

  const prompt = buildPrompt(job);
  fillPrompt(promptBox, prompt);

  const generateButton = await waitForGenerateButton(20000);
  if (!generateButton) {
    if (hasManualActionElement()) {
      return manualActionResult(job, "Meta needs login or captcha before generation can start.");
    }
    throw new Error("Could not find enabled Meta generate button.");
  }

  const mediaBefore = captureMediaBaseline();
  clickElement(generateButton);

  const result = await waitForGeneratedMedia(timeoutMs, mediaBefore, job.mediaType || "image", prompt);
  if (!result) {
    if (hasManualActionElement()) {
      return manualActionResult(job, "Meta needs manual action before media is available.");
    }
    throw new Error("Timed out waiting for generated media.");
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
  if (!aspectRatio) return prompt;
  const labels = {
    "16:9": "wide landscape 16:9",
    "9:16": "vertical portrait 9:16",
    "1:1": "square 1:1",
    "4:5": "portrait 4:5",
  };
  return `${prompt}\n\nCreate this in ${labels[aspectRatio] || `${aspectRatio} aspect ratio`}.`;
}

function fillPrompt(element, prompt) {
  element.focus();
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    element.value = prompt;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  element.textContent = "";
  document.execCommand("insertText", false, prompt);
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
}

function clickElement(element) {
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  element.click();
}

async function waitForGenerateButton(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const button = findFirst(META_SELECTORS.generateButton);
    if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") {
      return button;
    }
    await sleep(500);
  }
  return null;
}

async function waitForGeneratedMedia(timeoutMs, baseline, requestedMediaType, prompt) {
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
      .filter((candidate) => !baseline.groupElements.has(candidate.groupElement))
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
  return (ranked[0] || usable)
    .sort((a, b) => a.top - b.top || a.left - b.left || a.index - b.index)
    .slice(0, 4);
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
    element.currentSrc,
    element.src,
    element.href,
    firstSrcSetUrl(element.getAttribute("srcset")),
    element.getAttribute("src"),
    element.getAttribute("href"),
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
  return url.startsWith("http://") || url.startsWith("https://");
}

function firstDownloadableUrl(urls) {
  const cleanUrls = urls.map((url) => String(url || "").trim()).filter(Boolean);
  return cleanUrls.find((url) => url.startsWith("http://") || url.startsWith("https://")) || cleanUrls[0] || "";
}

function firstSrcSetUrl(srcset) {
  if (!srcset) return "";
  const firstCandidate = srcset.split(",").map((candidate) => candidate.trim()).find(Boolean);
  return firstCandidate ? firstCandidate.split(/\s+/)[0] : "";
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

function findFirst(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

function hasManualActionElement() {
  return Boolean(findFirst(META_SELECTORS.manualAction));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
