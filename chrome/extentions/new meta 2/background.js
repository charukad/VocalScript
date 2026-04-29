// background.js - Clean, unminified background service worker

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        console.log("Auto Meta Extension Installed.");
    }
});

// Open the side panel when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
    if (tab.windowId) {
        chrome.sidePanel.open({ windowId: tab.windowId });
    }
});

// Handle messages from the side panel or gateway
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "openDownloadsSettings") {
        chrome.tabs.create({ url: "chrome://settings/downloads" });
        sendResponse({ success: true });
    }
    
    if (message.type === "downloadFile") {
        if (!message.url) {
            sendResponse({ success: false, error: "Missing URL for download." });
            return true;
        }
        
        chrome.downloads.download({
            url: message.url,
            filename: message.filename || "meta_ai_download.mp4",
            conflictAction: "uniquify"
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error("Download failed:", chrome.runtime.lastError.message);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, downloadId });
            }
        });
        
        return true; // Keep message channel open for async response
    }
});
