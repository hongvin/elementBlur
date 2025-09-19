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
            <!-- Selection corners -->
            <path d="M1.5 0.5L1 0.5C0.72 0.5 0.5 0.72 0.5 1L0.5 1.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M14.5 0.5L15 0.5C15.28 0.5 15.5 0.72 15.5 1L15.5 1.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M1.5 15.5L1 15.5C0.72 15.5 0.5 15.28 0.5 15L0.5 14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M14.5 15.5L15 15.5C15.28 15.5 15.5 15.28 15.5 15L15.5 14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <!-- Dashed lines -->
            <path d="M3.5 0.5L5.5 0.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M7.5 0.5L9.5 0.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M11.5 0.5L13.5 0.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M3.5 15.5L5.5 15.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M7.5 15.5L9.5 15.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M11.5 15.5L13.5 15.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M0.5 3.5L0.5 5.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M0.5 7.5L0.5 9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M0.5 11.5L0.5 13.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M15.5 3.5L15.5 5.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M15.5 7.5L15.5 9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M15.5 11.5L15.5 13.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <!-- Cursor arrow -->
            <path d="M11.4 12.8C11.35 13 11.26 13 11.19 12.85L8.9 8.45C8.83 8.3 8.93 8.21 9.08 8.27L13.48 10.55C13.63 10.62 13.61 10.71 13.41 10.77L11.85 11.18Z" stroke="currentColor" stroke-width="1" stroke-linecap="round" fill="none"/>
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
        <button id="toolbar-undo" title="Undo">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M 1.3 4.7 L 1.3 10.7 L 7.3 10.7 L 4.9 8.25 C 5.8 7.47 7 7 8.3 7 C 10.7 7 12.7 8.53 13.4 10.65 L 15 10.12 C 14 7.34 11.4 5.3 8.3 5.3 C 6.6 5.3 4.9 5.97 3.7 7.08 L 1.3 4.7 Z" fill="currentColor"/>
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
