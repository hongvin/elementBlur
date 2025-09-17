chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: toggleToolbar,
  });
});

function toggleToolbar() {
  // This function runs in the page context
  const toolbarId = 'blur-toolbar-container';
  let toolbarContainer = document.getElementById(toolbarId);

  if (toolbarContainer) {
    toolbarContainer.remove();
    // Also remove overlay if it exists
    const overlay = document.getElementById('blur-mode-overlay');
    if (overlay) overlay.remove();
    document.body.style.cursor = 'default';
  } else {
    // Create toolbar
    toolbarContainer = document.createElement('div');
    toolbarContainer.id = toolbarId;
    toolbarContainer.style.cssText = 'position: fixed !important; top: 20px; right: 20px; z-index: 2147483647 !important; pointer-events: auto !important; filter: none !important;';
    toolbarContainer.innerHTML = `
      <div id="blur-toolbar">
        <div id="toolbar-drag-handle" title="Drag to move">
          <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
            <circle cx="3" cy="3" r="1.5" fill="currentColor"/>
            <circle cx="9" cy="3" r="1.5" fill="currentColor"/>
            <circle cx="3" cy="8" r="1.5" fill="currentColor"/>
            <circle cx="9" cy="8" r="1.5" fill="currentColor"/>
            <circle cx="3" cy="13" r="1.5" fill="currentColor"/>
            <circle cx="9" cy="13" r="1.5" fill="currentColor"/>
          </svg>
        </div>
        <button id="toolbar-select-element" title="Select Element">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L10 6H6L8 2Z" fill="currentColor"/>
            <path d="M8 10L6 14H10L8 10Z" fill="currentColor"/>
            <path d="M2 8L6 6V10L2 8Z" fill="currentColor"/>
            <path d="M14 8L10 10V6L14 8Z" fill="currentColor"/>
          </svg>
        </button>
        <button id="toolbar-draw-region" title="Draw Region">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <rect x="5" y="5" width="6" height="6" fill="currentColor" opacity="0.3"/>
          </svg>
        </button>
        <div class="slider-container">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <circle cx="7" cy="7" r="2" fill="currentColor"/>
          </svg>
          <input type="range" id="toolbar-blur-intensity" min="0" max="20" value="5" title="Blur Intensity">
        </div>
        <button id="toolbar-screenshot" title="Screenshot">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="4" width="12" height="9" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <circle cx="8" cy="8.5" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <rect x="6" y="2" width="4" height="2" rx="0.5" fill="currentColor"/>
          </svg>
        </button>
        <button id="toolbar-clear-all" title="Clear All">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 2V3H10V2C10 1.45 9.55 1 9 1H7C6.45 1 6 1.45 6 2Z" fill="currentColor"/>
            <path d="M3 4V13C3 14.1 3.9 15 5 15H11C12.1 15 13 14.1 13 13V4H3ZM6 12C6 12.28 5.78 12.5 5.5 12.5S5 12.28 5 12V7C5 6.72 5.22 6.5 5.5 6.5S6 6.72 6 7V12ZM8.5 12C8.5 12.28 8.28 12.5 8 12.5S7.5 12.28 7.5 12V7C7.5 6.72 7.72 6.5 8 6.5S8.5 6.72 8.5 7V12ZM11 12C11 12.28 10.78 12.5 10.5 12.5S10 12.28 10 12V7C10 6.72 10.22 6.5 10.5 6.5S11 6.72 11 7V12Z" fill="currentColor"/>
            <rect x="1" y="3" width="14" height="1.5" rx="0.5" fill="currentColor"/>
          </svg>
        </button>
        <button id="toolbar-close" title="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    `;
    document.body.appendChild(toolbarContainer);

    // Add CSS
    const style = document.createElement('style');
    style.textContent = `
      #blur-toolbar-container {
        position: fixed !important;
        z-index: 2147483647 !important;
        pointer-events: auto !important;
        filter: none !important;
      }
      
      #blur-toolbar {
        position: relative;
        top: 0;
        left: 0;
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 12px;
        padding: 8px;
        z-index: 2147483647 !important;
        display: flex;
        gap: 4px;
        align-items: center;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
        backdrop-filter: blur(20px);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        user-select: none;
        pointer-events: auto !important;
        filter: none !important;
      }
      
      #toolbar-drag-handle {
        cursor: move;
        color: #6b7280;
        padding: 6px 4px;
        opacity: 0.7;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.2s ease;
        pointer-events: auto !important;
        filter: none !important;
        z-index: 2147483647 !important;
      }
      
      #toolbar-drag-handle:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.05);
      }
      
      #blur-toolbar button {
        cursor: pointer;
        padding: 8px;
        border: none;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.02);
        color: #374151;
        min-width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        pointer-events: auto !important;
        filter: none !important;
        z-index: 2147483647 !important;
      }
      
      #blur-toolbar button:hover {
        background: rgba(0, 0, 0, 0.08);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }
      
      #blur-toolbar button:active {
        transform: translateY(0);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }
      
      .slider-container {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(0, 0, 0, 0.02);
        border-radius: 8px;
        padding: 6px 10px;
        pointer-events: auto !important;
        filter: none !important;
        z-index: 2147483647 !important;
      }
      
      .slider-container svg {
        color: #6b7280;
      }
      
      #blur-toolbar input[type="range"] {
        width: 60px;
        height: 4px;
        appearance: none;
        background: rgba(0, 0, 0, 0.1);
        border-radius: 2px;
        outline: none;
      }
      
      #blur-toolbar input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #374151;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        transition: all 0.2s ease;
      }
      
      #blur-toolbar input[type="range"]::-webkit-slider-thumb:hover {
        background: #1f2937;
        transform: scale(1.1);
      }
      
      #blur-toolbar input[type="range"]::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #374151;
        cursor: pointer;
        border: none;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }
    `;
    document.head.appendChild(style);

    // Send message to content script to set up event handlers
    window.postMessage({ type: 'SETUP_TOOLBAR' }, '*');
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toolbar-screenshot') {
    chrome.tabs.captureVisibleTab(null, {}, (image) => {
      chrome.tabs.create({ url: image });
    });
  }
});
