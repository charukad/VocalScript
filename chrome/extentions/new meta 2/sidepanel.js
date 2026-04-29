// sidepanel.js - Clean and Modular Auto Meta Logic

// --- Selectors Configuration ---
// Centralized DOM selectors for Meta AI so they can easily be updated.
const CONFIG = {
    URL: "https://www.meta.ai/create",
    SELECTORS: {
        IMAGE_INPUT: "input[type='file'][accept*='image']",
        IMAGE_THUMBNAIL: "img[src^='blob:']:not(.opacity-70)",
        PROMPT_TEXTBOX: "div[contenteditable='true'][role='textbox'], div[contenteditable='true'][role='searchbox']",
        GENERATE_BUTTON: "button[data-slot='button'][class*='bg-linear-to-r']",
        POLICY_ERROR: "div.placeholder-for-policy-error",
        VIDEO_ITEM: "div[data-testid='generated-video'][data-video-url]",
        DOWNLOAD_BUTTON: "button[data-slot='tooltip-trigger']:has(svg path[d^='M6'])",
        ARTICLE_ITEM: "article"
    }
};

// --- State Management ---
let isRunning = false;
let shouldStop = false;
let currentTaskIndex = 0;
let promptsList = [];
let imagesList = [];
let downloadedUrls = new Set();
let downloadIntervalId = null;

// --- DOM Elements ---
const elPrompts = document.getElementById("prompts");
const elImageInput = document.getElementById("imageInput");
const elUploadImageBtn = document.getElementById("uploadImageBtn");
const elClearImageBtn = document.getElementById("clearImageBtn");
const elImageCount = document.getElementById("imageCount");
const elWaitMin = document.getElementById("waitMin");
const elWaitMax = document.getElementById("waitMax");
const elAutoDownload = document.getElementById("autoDownload");
const elStartBtn = document.getElementById("startBtn");
const elStopBtn = document.getElementById("stopBtn");
const elLogArea = document.getElementById("logArea");

// --- Helper Functions ---
function log(msg, type = "info") {
    const time = new Date().toLocaleTimeString();
    const div = document.createElement("div");
    div.className = `log-entry`;
    div.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-${type}">${msg}</span>`;
    elLogArea.appendChild(div);
    elLogArea.scrollTop = elLogArea.scrollHeight;
}

function getRandomWaitTime() {
    const min = parseInt(elWaitMin.value) || 15;
    const max = parseInt(elWaitMax.value) || 30;
    const minMs = Math.min(min, max) * 1000;
    const maxMs = Math.max(min, max) * 1000;
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Event Listeners ---
elUploadImageBtn.addEventListener("click", () => elImageInput.click());

elImageInput.addEventListener("change", (e) => {
    imagesList = Array.from(e.target.files);
    elImageCount.textContent = `${imagesList.length} selected`;
    log(`Selected ${imagesList.length} images.`, "info");
});

elClearImageBtn.addEventListener("click", () => {
    imagesList = [];
    elImageInput.value = "";
    elImageCount.textContent = "0 selected";
    log("Images cleared.", "info");
});

elStopBtn.addEventListener("click", () => {
    shouldStop = true;
    log("Stopping requested...", "warn");
});

elStartBtn.addEventListener("click", async () => {
    promptsList = elPrompts.value.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
    
    if (promptsList.length === 0 && imagesList.length === 0) {
        log("Please provide prompts or images.", "error");
        return;
    }
    
    isRunning = true;
    shouldStop = false;
    currentTaskIndex = 0;
    
    elStartBtn.disabled = true;
    elStopBtn.disabled = false;
    
    log("Starting automation...", "info");
    
    try {
        await runAutomation();
    } catch (e) {
        log(`Error: ${e.message}`, "error");
    } finally {
        isRunning = false;
        elStartBtn.disabled = false;
        elStopBtn.disabled = true;
        
        if (downloadIntervalId) {
            clearInterval(downloadIntervalId);
            downloadIntervalId = null;
        }
        log("Automation stopped.", "warn");
    }
});

// --- Core Automation Logic ---
async function runAutomation() {
    // Find or open Meta AI tab
    let tabs = await chrome.tabs.query({ url: "*://*.meta.ai/*" });
    let targetTab = tabs.find(t => t.url.startsWith(CONFIG.URL));
    
    if (!targetTab) {
        log("Meta AI tab not found, creating new one...", "info");
        targetTab = await chrome.tabs.create({ url: CONFIG.URL });
        await sleep(5000); // Wait for load
    } else {
        await chrome.tabs.update(targetTab.id, { active: true });
    }
    
    const tabId = targetTab.id;
    
    // Auto-download poller
    if (elAutoDownload.checked) {
        downloadIntervalId = setInterval(() => pollForDownloads(tabId), 5000);
    }
    
    // Determine total tasks
    const totalTasks = Math.max(promptsList.length, imagesList.length);
    
    for (let i = 0; i < totalTasks; i++) {
        if (shouldStop) break;
        
        const prompt = promptsList[i % promptsList.length] || "";
        const imageFile = imagesList.length > 0 ? imagesList[i % imagesList.length] : null;
        
        log(`Processing task ${i + 1}/${totalTasks}...`, "info");
        
        // Execute injection script
        let result = false;
        if (imageFile) {
            const dataUrl = await readFileAsDataURL(imageFile);
            result = await executeScript(tabId, injectImageAndPrompt, [dataUrl, imageFile.name, imageFile.type, prompt, CONFIG.SELECTORS]);
        } else {
            result = await executeScript(tabId, injectPromptOnly, [prompt, CONFIG.SELECTORS]);
        }
        
        if (result === true) {
            log(`Task ${i + 1} submitted successfully.`, "success");
            const waitTime = getRandomWaitTime();
            log(`Waiting ${Math.round(waitTime/1000)}s...`, "info");
            
            // Wait loop checking for stop
            const waitEnd = Date.now() + waitTime;
            while (Date.now() < waitEnd) {
                if (shouldStop) return;
                await sleep(500);
            }
        } else {
            log(`Task ${i + 1} failed.`, "error");
        }
    }
    
    log("All tasks completed.", "success");
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("File read error"));
        reader.readAsDataURL(file);
    });
}

// Wrapper for executing scripts in the tab
async function executeScript(tabId, func, args) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: func,
            args: args,
            world: "MAIN"
        });
        if (results && results[0] && results[0].result !== undefined) {
            return results[0].result;
        }
        return false;
    } catch (e) {
        log(`Script injection failed: ${e.message}`, "error");
        return false;
    }
}

// --- Injected Scripts (run in page context) ---

async function injectImageAndPrompt(dataUrl, fileName, mimeType, promptText, selectors) {
    function simulateClick(el) {
        el.dispatchEvent(new MouseEvent("mousedown", {bubbles: true}));
        el.dispatchEvent(new MouseEvent("mouseup", {bubbles: true}));
        el.click();
    }
    
    try {
        // Convert base64 to File
        const arr = dataUrl.split(',');
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--) u8arr[n] = bstr.charCodeAt(n);
        const file = new File([u8arr], fileName, { type: mimeType });
        
        // Find input
        const fileInput = document.querySelector(selectors.IMAGE_INPUT);
        if (!fileInput) return false;
        
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        await new Promise(r => setTimeout(r, 2000)); // wait for upload
        
        // Input text
        const textBox = document.querySelector(selectors.PROMPT_TEXTBOX);
        if (!textBox) return false;
        
        textBox.focus();
        document.execCommand('insertText', false, promptText);
        textBox.dispatchEvent(new Event('input', { bubbles: true }));
        
        await new Promise(r => setTimeout(r, 1000));
        
        // Click Generate
        const genBtn = document.querySelector(selectors.GENERATE_BUTTON);
        if (genBtn && !genBtn.disabled) {
            simulateClick(genBtn);
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

async function injectPromptOnly(promptText, selectors) {
    function simulateClick(el) {
        el.dispatchEvent(new MouseEvent("mousedown", {bubbles: true}));
        el.dispatchEvent(new MouseEvent("mouseup", {bubbles: true}));
        el.click();
    }
    
    try {
        // Input text
        const textBox = document.querySelector(selectors.PROMPT_TEXTBOX);
        if (!textBox) return false;
        
        textBox.focus();
        document.execCommand('insertText', false, promptText);
        textBox.dispatchEvent(new Event('input', { bubbles: true }));
        
        await new Promise(r => setTimeout(r, 1000));
        
        // Click Generate
        const genBtn = document.querySelector(selectors.GENERATE_BUTTON);
        if (genBtn && !genBtn.disabled) {
            simulateClick(genBtn);
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

async function pollForDownloads(tabId) {
    if (!isRunning) return;
    try {
        const foundMedia = await executeScript(tabId, findMediaToDownload, [Array.from(downloadedUrls), CONFIG.SELECTORS]);
        if (foundMedia && foundMedia.length > 0) {
            for (const item of foundMedia) {
                if (!downloadedUrls.has(item)) {
                    downloadedUrls.add(item);
                    log(`Downloading generated media...`, "success");
                    chrome.runtime.sendMessage({ type: "downloadFile", url: item });
                }
            }
        }
    } catch (e) {}
}

function findMediaToDownload(existingUrls, selectors) {
    const urlsToDownload = [];
    try {
        // Look for video items or articles with images
        const elements = document.querySelectorAll(selectors.VIDEO_ITEM);
        elements.forEach(el => {
            const url = el.getAttribute('data-video-url');
            if (url && !existingUrls.includes(url)) {
                urlsToDownload.push(url);
            }
        });
    } catch (e) {}
    return urlsToDownload;
}
