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

  fillPrompt(promptBox, job.prompt);

  const generateButton = await waitForGenerateButton(20000);
  if (!generateButton) {
    if (hasManualActionElement()) {
      return manualActionResult(job, "Meta needs login or captcha before generation can start.");
    }
    throw new Error("Could not find enabled Meta generate button.");
  }

  const mediaBefore = new Set(findMediaUrls());
  clickElement(generateButton);

  const mediaUrl = await waitForGeneratedMedia(timeoutMs, mediaBefore);
  if (!mediaUrl) {
    if (hasManualActionElement()) {
      return manualActionResult(job, "Meta needs manual action before media is available.");
    }
    throw new Error("Timed out waiting for generated media.");
  }

  return {
    status: "completed",
    mediaUrl,
    mediaType: job.mediaType || "image",
    metadata: {
      provider: "meta",
      providerPageUrl: location.href,
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

async function waitForGeneratedMedia(timeoutMs, seenBefore) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const urls = findMediaUrls().filter((url) => !seenBefore.has(url));
    if (urls.length > 0) return urls[urls.length - 1];
    await sleep(1500);
  }

  return null;
}

function findMediaUrls() {
  const urls = [];
  for (const selector of META_SELECTORS.media) {
    document.querySelectorAll(selector).forEach((element) => {
      const url = extractUrl(element);
      if (url && !urls.includes(url)) urls.push(url);
    });
  }
  return urls.filter(isUsableMediaUrl);
}

function extractUrl(element) {
  if (element.dataset?.videoUrl) return element.dataset.videoUrl;
  if (element.currentSrc) return element.currentSrc;
  if (element.src) return element.src;
  if (element.href) return element.href;
  return element.getAttribute("src") || element.getAttribute("href") || "";
}

function isUsableMediaUrl(url) {
  if (!url) return false;
  if (url.startsWith("data:")) return false;
  return url.startsWith("blob:") || url.startsWith("http://") || url.startsWith("https://");
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
