// Element Blur — background service worker.
//
// Responsibilities:
//   1. Toggle the in-page toolbar when the user clicks the extension action.
//   2. Capture the visible tab when the content script asks for a screenshot.
//
// All page interaction lives in content.js, and the toolbar DOM is created there
// too — so no page-context bridge (window.postMessage) is required.

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id === undefined) return;

  try {
    // Injected on demand (and idempotent), so pages only ever see this extension
    // when the user actually asks for it.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch (error) {
    // Restricted pages: chrome://, the Chrome Web Store, the PDF viewer, ...
    flashBadge();
    console.warn('Element Blur: cannot run on this page.', error);
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'element-blur:toggle-toolbar' }, () => {
    // Read lastError to avoid "Unchecked runtime.lastError" when the frame is gone.
    void chrome.runtime.lastError;
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request) return;

  // One viewport capture for the content script, which does the cropping /
  // stitching itself. captureVisibleTab() is rate limited to 2 calls/second.
  if (request.action === 'element-blur:capture') {
    (async () => {
      try {
        const dataUrl = await captureVisibleTab(sender.tab ? sender.tab.windowId : null);
        sendResponse({ ok: true, dataUrl });
      } catch (error) {
        console.warn('Element Blur: capture failed.', error);
        flashBadge();
        sendResponse({ ok: false, error: String((error && error.message) || error) });
      }
    })();
    // Keep the message channel open for the asynchronous sendResponse().
    return true;
  }

  // A finished screenshot goes to the viewer tab.
  if (request.action === 'element-blur:open-viewer') {
    (async () => {
      try {
        await openViewer(request.payload);
        sendResponse({ ok: true });
      } catch (error) {
        console.warn('Element Blur: could not open the screenshot viewer.', error);
        flashBadge();
        sendResponse({ ok: false, error: String((error && error.message) || error) });
      }
    })();
    return true;
  }
});

function captureVisibleTab(windowId) {
  return new Promise((resolve, reject) => {
    // Callback form on purpose: captureVisibleTab() is rate limited to 2 calls per
    // second (chrome.tabs.MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND) and fails with
    // "MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND exceeded" when hammered.
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!dataUrl) {
        reject(new Error('captureVisibleTab() returned no image'));
      } else {
        resolve(dataUrl);
      }
    });
  });
}

// Opens a finished screenshot in a dedicated extension viewer tab.
//
// The payload travels through chrome.storage.session because Chromium blocks
// top-frame navigation to data: URLs ("Not allowed to navigate the top frame to
// data URL"). storage.session needs the "storage" permission, which the manifest
// declares.
async function openViewer(payload) {
  const key = 'shot-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  try {
    await chrome.storage.session.set({ [key]: payload });
    await chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html#${key}`) });
  } catch (error) {
    // storage.session unavailable or over quota — fall back to the legacy data-URL tab.
    console.warn('Element Blur: falling back to a data-URL tab.', error);
    await chrome.tabs.create({ url: payload && payload.dataUrl ? payload.dataUrl : 'about:blank' });
  }
}

let badgeTimer = null;

// Visible feedback when something silently used to fail (restricted page, capture
// error): flash a badge on the toolbar icon instead of doing nothing.
function flashBadge(text) {
  chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  chrome.action.setBadgeText({ text: text || '!' });
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
}
