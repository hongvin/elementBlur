(() => {
  'use strict';

  // Element Blur — screenshot viewer.
  //
  // The capture is passed in through chrome.storage.session under the key in the
  // URL hash (see openViewer() in background.js), because Chromium blocks
  // top-frame navigation to data: URLs. The entry is read once and discarded.

  const key = decodeURIComponent(window.location.hash.slice(1));
  const img = document.getElementById('shot');
  const message = document.getElementById('message');
  const downloadBtn = document.getElementById('download');
  const closeBtn = document.getElementById('close');

  let dataUrl = '';
  let filename = '';

  function showMessage(text) {
    message.textContent = text;
    message.hidden = false;
    img.hidden = true;
    downloadBtn.disabled = true;
  }

  function closeTab() {
    // window.close() is ignored for tabs the page did not open itself.
    chrome.tabs.getCurrent((tab) => {
      if (tab && tab.id !== undefined) chrome.tabs.remove(tab.id);
      else window.close();
    });
  }

  closeBtn.addEventListener('click', closeTab);

  downloadBtn.addEventListener('click', () => {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename || 'element-blur-screenshot.png';
    link.click();
  });

  (async () => {
    if (!key || !chrome.storage || !chrome.storage.session) {
      showMessage('This page only opens from the Element Blur extension.');
      return;
    }

    try {
      const stored = await chrome.storage.session.get(key);
      const payload = stored[key];
      // A bare string is accepted too, for older payloads.
      dataUrl = typeof payload === 'string' ? payload : (payload && payload.dataUrl) || '';
      filename = (payload && payload.filename) || '';
      await chrome.storage.session.remove(key);
    } catch (error) {
      showMessage('Could not read the screenshot: ' + error.message);
      return;
    }

    if (!dataUrl) {
      showMessage('Screenshot not found — it may have expired. Please take the shot again.');
      return;
    }

    img.src = dataUrl;
    img.hidden = false;
  })();
})();
