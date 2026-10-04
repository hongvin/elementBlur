(() => {
  'use strict';

  /* Element Blur — content script.
   *
   * Injected on demand from the extension action (see background.js) and fully
   * idempotent: a second injection into the same frame exits immediately.
   * Everything that touches the page lives here — effects, interactions and the
   * toolbar itself — so the background service worker needs no page bridge.
   */

  const STYLE_ID = 'element-blur-stylesheet';
  const TOOLBAR_STYLE_ID = 'element-blur-toolbar-stylesheet';
  const TOOLBAR_ID = 'blur-toolbar-container';
  const TOOLBAR_INNER_ID = 'blur-toolbar';
  const OVERLAY_ID = 'blur-mode-overlay';
  const TEXT_SPAN_SELECTOR = '.blur-text, .highlight-text';

  if (document.getElementById(STYLE_ID)) return;

  let isSelecting = false;
  let isDrawing = false;
  let isSelectingText = false;
  let blurIntensity = 5;
  let highlightOpacity = 0.5; // Default opacity for highlights
  let highlightColor = '#FFFF00'; // Default yellow color
  let isHighlightMode = false; // false = blur mode, true = highlight mode
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  let region = null;
  let overlay = null;
  let lastHighlightedElement = null;
  const blurHistory = [];
  let toolbarListeners = null; // AbortController for document-level toolbar listeners

  /* ------------------------------------------------------------------ *
   * Host-page style bookkeeping
   * ------------------------------------------------------------------ */

  // The host page keeps its own inline styles for cursor / user-select. Save and
  // restore them exactly instead of stamping 'default' onto the page and
  // overriding its cascade forever.
  const savedBodyStyles = new Map();

  function setBodyStyle(property, value, priority) {
    if (!document.body) return;
    if (!savedBodyStyles.has(property)) {
      savedBodyStyles.set(property, {
        value: document.body.style.getPropertyValue(property),
        priority: document.body.style.getPropertyPriority(property),
      });
    }
    document.body.style.setProperty(property, value, priority || '');
  }

  function restoreBodyStyle(property) {
    const saved = savedBodyStyles.get(property);
    if (!saved || !document.body) return;
    if (saved.value) {
      document.body.style.setProperty(property, saved.value, saved.priority);
    } else {
      document.body.style.removeProperty(property);
    }
    savedBodyStyles.delete(property);
  }

  /* ------------------------------------------------------------------ *
   * Effect stylesheet
   * ------------------------------------------------------------------ */

  function closestIn(target, selector) {
    return target && typeof target.closest === 'function' ? target.closest(selector) : null;
  }

  function isToolbarTarget(target) {
    return Boolean(closestIn(target, `#${TOOLBAR_ID}`));
  }

  function toRgba(hex, alpha) {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!match) return `rgba(255, 255, 0, ${alpha})`;
    let digits = match[1];
    if (digits.length === 3) {
      digits = digits
        .split('')
        .map((d) => d + d)
        .join('');
    }
    const value = parseInt(digits, 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }

  // Transparency belongs in the *colour*, never in `opacity`: opacity would fade
  // the element's text and children along with its background.
  function highlightBackground() {
    return toRgba(highlightColor, highlightOpacity);
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  (document.head || document.documentElement).appendChild(style);

  function updateBlurStyle() {
    const highlight = highlightBackground();
    style.textContent = `
    .blurred:not(#${TOOLBAR_ID}):not(#${TOOLBAR_INNER_ID}):not(#${TOOLBAR_INNER_ID} *) {
      filter: blur(${blurIntensity}px);
    }
    .blur-region {
      position: absolute;
      background-color: rgba(0, 0, 0, 0.01);
      backdrop-filter: blur(${blurIntensity}px);
      -webkit-backdrop-filter: blur(${blurIntensity}px);
      z-index: 99999;
      pointer-events: auto;
      cursor: pointer;
    }
    .blur-text {
      color: transparent !important;
      text-shadow: 0 0 ${blurIntensity}px rgba(0, 0, 0, 0.5) !important;
      background: rgba(0, 0, 0, 0.1) !important;
      border-radius: 2px !important;
    }
    .highlighted:not(#${TOOLBAR_ID}):not(#${TOOLBAR_INNER_ID}):not(#${TOOLBAR_INNER_ID} *) {
      background-color: ${highlight} !important;
    }
    .highlight-region {
      position: absolute;
      background-color: ${highlight};
      z-index: 99999;
      pointer-events: auto;
      cursor: pointer;
    }
    .highlight-text {
      background-color: ${highlight} !important;
      border-radius: 2px !important;
    }
  `;
  }

  /* ------------------------------------------------------------------ *
   * Draw-mode overlay
   * ------------------------------------------------------------------ */

  function createOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    document.body.appendChild(overlay);
    setBodyStyle('cursor', 'crosshair');
  }

  function removeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    restoreBodyStyle('cursor');
    restoreBodyStyle('user-select');
    if (lastHighlightedElement) {
      lastHighlightedElement.classList.remove('element-highlight');
      lastHighlightedElement = null;
    }
    isSelecting = false;
    isDrawing = false;
    isSelectingText = false;
  }

  function exitSelectMode() {
    restoreBodyStyle('cursor');
    if (lastHighlightedElement) {
      lastHighlightedElement.classList.remove('element-highlight');
      lastHighlightedElement = null;
    }
    isSelecting = false;
  }

  function highlightElement(element) {
    if (lastHighlightedElement) {
      lastHighlightedElement.classList.remove('element-highlight');
    }
    if (element && element !== overlay && !isToolbarTarget(element)) {
      element.classList.add('element-highlight');
      lastHighlightedElement = element;
    }
  }

  /* ------------------------------------------------------------------ *
   * Action history
   * ------------------------------------------------------------------ */

  function trackBlurAction(element, action) {
    if (!element) return;
    blurHistory.push({ element, action });
  }

  // Removes a wrapper element but keeps its children in place.
  function unwrap(element) {
    if (!element || !element.parentNode) return;
    while (element.firstChild) {
      element.parentNode.insertBefore(element.firstChild, element);
    }
    element.remove();
  }

  function undoLastAction() {
    while (blurHistory.length > 0) {
      const last = blurHistory.pop();
      if (!last || !last.element) continue;
      if (last.action === 'blurred') {
        last.element.classList.remove('blurred');
        break;
      }
      if (last.action === 'highlighted') {
        last.element.classList.remove('highlighted');
        break;
      }
      if (last.action === 'region' || last.action === 'highlight-region') {
        if (last.element.parentNode) {
          last.element.remove();
          break;
        }
        continue; // already detached — fall through to the previous action
      }
      if (last.action === 'text-blur' || last.action === 'text-highlight') {
        unwrap(last.element);
        break;
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Toolbar
   * ------------------------------------------------------------------ */

  const TOOLBAR_HTML = `
      <div id="${TOOLBAR_INNER_ID}">
        <div id="toolbar-drag-handle" title="Drag to move">
          <svg width="12" height="16" viewBox="0 0 12 16" fill="none" aria-hidden="true">
            <circle cx="3" cy="3" r="1.5" fill="currentColor"/>
            <circle cx="9" cy="3" r="1.5" fill="currentColor"/>
            <circle cx="3" cy="8" r="1.5" fill="currentColor"/>
            <circle cx="9" cy="8" r="1.5" fill="currentColor"/>
            <circle cx="3" cy="13" r="1.5" fill="currentColor"/>
            <circle cx="9" cy="13" r="1.5" fill="currentColor"/>
          </svg>
        </div>
        <button id="toolbar-mode-toggle" title="Switch to Highlight Mode">🌫️</button>
        <button id="toolbar-select-element" title="Select Element">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M1.5 0.5L1 0.5C0.72 0.5 0.5 0.72 0.5 1L0.5 1.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M14.5 0.5L15 0.5C15.28 0.5 15.5 0.72 15.5 1L15.5 1.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M1.5 15.5L1 15.5C0.72 15.5 0.5 15.28 0.5 15L0.5 14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <path d="M14.5 15.5L15 15.5C15.28 15.5 15.5 15.28 15.5 15L15.5 14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
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
            <path d="M11.4 12.8C11.35 13 11.26 13 11.19 12.85L8.9 8.45C8.83 8.3 8.93 8.21 9.08 8.27L13.48 10.55C13.63 10.62 13.61 10.71 13.41 10.77L11.85 11.18Z" stroke="currentColor" stroke-width="1" stroke-linecap="round" fill="none"/>
          </svg>
        </button>
        <button id="toolbar-draw-region" title="Draw Region">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <rect x="5" y="5" width="6" height="6" fill="currentColor" opacity="0.3"/>
          </svg>
        </button>
        <button id="toolbar-select-text" title="Select Text">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 2.6C9.9 2.6 9.9 2.6 9.8 2.7L4.7 2.7L4 2.7C3.7 2.7 3.3 3 3.3 3.3L3.3 5.3C3.3 5.7 3.7 6 4 6L4.7 6C5 6 5.3 5.7 5.3 5.3L5.3 4.7L8.7 4.7L8.7 15.3L8 15.3C7.7 15.3 7.3 15.7 7.3 16L7.3 16.7C7.3 17 7.7 17.3 8 17.3L9.8 17.3C9.9 17.4 10.1 17.4 10.2 17.3L12 17.3C12.4 17.3 12.7 17 12.7 16.7L12.7 16C12.7 15.7 12.4 15.3 12 15.3L11.3 15.3L11.3 4.7L14.7 4.7L14.7 5.3C14.7 5.7 15 6 15.3 6L16 6C16.4 6 16.7 5.7 16.7 5.3L16.7 3.3C16.7 3 16.4 2.7 16 2.7L15.3 2.7L10.2 2.7C10.1 2.6 10.1 2.6 10 2.6Z" fill="currentColor"/>
          </svg>
        </button>
        <div class="color-picker-container">
          <input type="color" id="toolbar-color-picker" value="#FFFF00" title="Highlight Color">
        </div>
        <div class="slider-container">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <circle cx="7" cy="7" r="2" fill="currentColor"/>
          </svg>
          <input type="range" id="toolbar-blur-intensity" min="0" max="20" value="5" title="Blur Intensity">
        </div>
        <button id="toolbar-screenshot" title="Screenshot">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2" y="4" width="12" height="9" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <circle cx="8" cy="8.5" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <rect x="6" y="2" width="4" height="2" rx="0.5" fill="currentColor"/>
          </svg>
        </button>
        <button id="toolbar-undo" title="Undo">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M 1.3 4.7 L 1.3 10.7 L 7.3 10.7 L 4.9 8.25 C 5.8 7.47 7 7 8.3 7 C 10.7 7 12.7 8.53 13.4 10.65 L 15 10.12 C 14 7.34 11.4 5.3 8.3 5.3 C 6.6 5.3 4.9 5.97 3.7 7.08 L 1.3 4.7 Z" fill="currentColor"/>
          </svg>
        </button>
        <button id="toolbar-clear-all" title="Clear All">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 2V3H10V2C10 1.45 9.55 1 9 1H7C6.45 1 6 1.45 6 2Z" fill="currentColor"/>
            <path d="M3 4V13C3 14.1 3.9 15 5 15H11C12.1 15 13 14.1 13 13V4H3ZM6 12C6 12.28 5.78 12.5 5.5 12.5S5 12.28 5 12V7C5 6.72 5.22 6.5 5.5 6.5S6 6.72 6 7V12ZM8.5 12C8.5 12.28 8.28 12.5 8 12.5S7.5 12.28 7.5 12V7C7.5 6.72 7.72 6.5 8 6.5S8.5 6.72 8.5 7V12ZM11 12C11 12.28 10.78 12.5 10.5 12.5S10 12.28 10 12V7C10 6.72 10.22 6.5 10.5 6.5S11 6.72 11 7V12Z" fill="currentColor"/>
            <rect x="1" y="3" width="14" height="1.5" rx="0.5" fill="currentColor"/>
          </svg>
        </button>
        <button id="toolbar-close" title="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    `;

  // Static chrome for the toolbar and the draw overlay. The effect rules above
  // are dynamic (they depend on the slider / colour), these are not.
  const TOOLBAR_CSS = `
      #${TOOLBAR_ID} {
        position: fixed !important;
        top: 20px;
        right: 20px;
        z-index: 2147483647 !important;
        pointer-events: auto !important;
        filter: none !important;
      }

      #${TOOLBAR_ID}, #${TOOLBAR_ID} * {
        filter: none !important;
        pointer-events: auto !important;
      }

      #${TOOLBAR_INNER_ID} {
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

      #${TOOLBAR_INNER_ID} button {
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

      #${TOOLBAR_INNER_ID} button:hover {
        background: rgba(0, 0, 0, 0.08);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      #${TOOLBAR_INNER_ID} button:active {
        transform: translateY(0);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      #toolbar-mode-toggle {
        font-size: 18px;
        line-height: 1;
        padding: 6px 8px;
      }

      .color-picker-container {
        display: flex;
        align-items: center;
        background: rgba(0, 0, 0, 0.02);
        border-radius: 8px;
        padding: 4px;
        pointer-events: auto !important;
        filter: none !important;
        z-index: 2147483647 !important;
      }

      #toolbar-color-picker {
        width: 32px;
        height: 24px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        background: none;
        padding: 0;
      }

      #toolbar-color-picker::-webkit-color-swatch-wrapper {
        padding: 0;
      }

      #toolbar-color-picker::-webkit-color-swatch {
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 6px;
      }

      #toolbar-color-picker::-moz-color-swatch {
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 6px;
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

      #${TOOLBAR_INNER_ID} input[type="range"] {
        width: 60px;
        height: 4px;
        appearance: none;
        background: rgba(0, 0, 0, 0.1);
        border-radius: 2px;
        outline: none;
      }

      #${TOOLBAR_INNER_ID} input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #374151;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        transition: all 0.2s ease;
      }

      #${TOOLBAR_INNER_ID} input[type="range"]::-webkit-slider-thumb:hover {
        background: #1f2937;
        transform: scale(1.1);
      }

      #${TOOLBAR_INNER_ID} input[type="range"]::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #374151;
        cursor: pointer;
        border: none;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }

      #${OVERLAY_ID} {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(0, 0, 0, 0.3);
        z-index: 99998;
        pointer-events: auto;
      }

      .element-highlight {
        outline: 2px solid #007acc !important;
        outline-offset: 2px !important;
        background-color: rgba(0, 122, 204, 0.1) !important;
      }

      #element-blur-shot-menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 176px;
        padding: 6px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 10px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
        z-index: 2147483647 !important;
      }

      #element-blur-shot-menu button {
        justify-content: flex-start;
        height: auto;
        min-width: 0;
        padding: 8px 10px;
        font-size: 13px;
        white-space: nowrap;
      }

      #element-blur-toast {
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%);
        padding: 8px 16px;
        border-radius: 999px;
        background: rgba(17, 24, 39, 0.92);
        color: #f9fafb;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
        z-index: 2147483647 !important;
        pointer-events: none !important;
      }

      #element-blur-toast[hidden],
      #${TOOLBAR_ID}[hidden],
      #${OVERLAY_ID}[hidden] {
        display: none !important;
      }
    `;

  const toolbarStyle = document.createElement('style');
  toolbarStyle.id = TOOLBAR_STYLE_ID;
  toolbarStyle.textContent = TOOLBAR_CSS;
  (document.head || document.documentElement).appendChild(toolbarStyle);

  function openToolbar() {
    const container = document.createElement('div');
    container.id = TOOLBAR_ID;
    container.innerHTML = TOOLBAR_HTML;
    document.body.appendChild(container);
    syncToolbarWithState(container);
    setupToolbarEventListeners(container);
  }

  function closeToolbar() {
    const container = document.getElementById(TOOLBAR_ID);
    if (container) container.remove();
    if (toolbarListeners) {
      toolbarListeners.abort();
      toolbarListeners = null;
    }
    closeScreenshotMenu();
    hideToast();
    removeOverlay();
  }

  function toggleToolbar() {
    if (document.getElementById(TOOLBAR_ID)) {
      closeToolbar();
    } else {
      openToolbar();
    }
  }

  // The toolbar is rebuilt on every open, so reflect the current state (mode,
  // colour, intensity) instead of resetting the buttons to their defaults.
  function syncToolbarWithState(container) {
    const modeToggle = container.querySelector('#toolbar-mode-toggle');
    const intensitySlider = container.querySelector('#toolbar-blur-intensity');
    const colorPicker = container.querySelector('#toolbar-color-picker');
    const colorPickerContainer = container.querySelector('.color-picker-container');

    if (modeToggle) {
      modeToggle.textContent = isHighlightMode ? '🖍️' : '🌫️';
      modeToggle.title = isHighlightMode ? 'Switch to Blur Mode' : 'Switch to Highlight Mode';
    }
    if (intensitySlider) {
      intensitySlider.title = isHighlightMode ? 'Highlight Opacity' : 'Blur Intensity';
      intensitySlider.value = isHighlightMode
        ? String(Math.round(highlightOpacity * 20))
        : String(blurIntensity);
    }
    if (colorPicker) colorPicker.value = highlightColor;
    if (colorPickerContainer) {
      colorPickerContainer.style.display = isHighlightMode ? 'flex' : 'none';
    }
  }

  function setupToolbarEventListeners(container) {
    const selectBtn = container.querySelector('#toolbar-select-element');
    const drawBtn = container.querySelector('#toolbar-draw-region');
    const clearBtn = container.querySelector('#toolbar-clear-all');
    const undoBtn = container.querySelector('#toolbar-undo');
    const intensitySlider = container.querySelector('#toolbar-blur-intensity');
    const screenshotBtn = container.querySelector('#toolbar-screenshot');
    const closeBtn = container.querySelector('#toolbar-close');
    const dragHandle = container.querySelector('#toolbar-drag-handle');
    const toolbar = container.querySelector(`#${TOOLBAR_INNER_ID}`);
    const modeToggle = container.querySelector('#toolbar-mode-toggle');
    const colorPicker = container.querySelector('#toolbar-color-picker');

    // Mode toggle button
    if (modeToggle) {
      modeToggle.addEventListener('click', () => {
        isHighlightMode = !isHighlightMode;
        // Re-sync so the slider, titles and colour picker match the new mode.
        syncToolbarWithState(container);
      });
    }

    // Color picker
    if (colorPicker) {
      colorPicker.addEventListener('input', (e) => {
        highlightColor = e.target.value;
        updateBlurStyle();
      });
    }

    if (selectBtn) {
      selectBtn.addEventListener('click', () => {
        closeScreenshotMenu();
        isSelecting = true;
        isDrawing = false;
        isSelectingText = false;
        restoreBodyStyle('user-select'); // cancel any pending text pick
        setBodyStyle('cursor', 'crosshair');
      });
    }

    // Select text button logic
    const selectTextBtn = container.querySelector('#toolbar-select-text');
    if (selectTextBtn) {
      selectTextBtn.addEventListener('click', () => {
        closeScreenshotMenu();
        isSelectingText = true;
        isSelecting = false;
        isDrawing = false;
        setBodyStyle('cursor', 'text');
        // Allow the user to actually select text, even on pages that disable it.
        setBodyStyle('user-select', 'text', 'important');
      });
    }

    // Undo button logic
    if (undoBtn) {
      undoBtn.addEventListener('click', undoLastAction);
    }

    if (drawBtn) {
      drawBtn.addEventListener('click', () => {
        closeScreenshotMenu();
        isDrawing = true;
        isSelecting = false;
        isSelectingText = false;
        restoreBodyStyle('user-select'); // cancel any pending text pick
        createOverlay();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        document.querySelectorAll('.blurred').forEach((el) => el.classList.remove('blurred'));
        document.querySelectorAll('.highlighted').forEach((el) => el.classList.remove('highlighted'));
        document.querySelectorAll('.blur-region').forEach((el) => el.remove());
        document.querySelectorAll('.highlight-region').forEach((el) => el.remove());
        // Unwrap text spans instead of leaving empty <span> wrappers in the
        // host page's DOM.
        document.querySelectorAll(TEXT_SPAN_SELECTOR).forEach((el) => unwrap(el));
        blurHistory.length = 0;
        removeOverlay();
      });
    }

    if (intensitySlider) {
      intensitySlider.addEventListener('input', (e) => {
        if (isHighlightMode) {
          highlightOpacity = e.target.value / 20; // Convert 0-20 to 0-1
        } else {
          blurIntensity = e.target.value;
        }
        // Regions take their colour / blur radius from the stylesheet, so one
        // refresh updates everything already on the page.
        updateBlurStyle();
      });
    }

    if (screenshotBtn) {
      screenshotBtn.addEventListener('click', () => {
        // Menu with the three capture targets: visible area, element, full page.
        openScreenshotMenu();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', closeToolbar);
    }

    // Make toolbar draggable
    if (dragHandle && toolbar) {
      // Document-level drag listeners must not stack when the toolbar is
      // reopened, so they are bound to an AbortController owned by this open.
      if (toolbarListeners) toolbarListeners.abort();
      const controller = new AbortController();
      toolbarListeners = controller;

      let isDragging = false;
      let dragOffset = { x: 0, y: 0 };

      dragHandle.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = container.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        e.preventDefault();
        e.stopPropagation();
      });

      document.addEventListener(
        'mousemove',
        (e) => {
          if (isDragging && !isSelecting && !isDrawing) {
            const x = e.clientX - dragOffset.x;
            const y = e.clientY - dragOffset.y;

            // Keep toolbar within viewport bounds
            const maxX = window.innerWidth - container.offsetWidth;
            const maxY = window.innerHeight - container.offsetHeight;

            container.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
            container.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
            container.style.right = 'auto'; // Remove right positioning
          }
        },
        { signal: controller.signal }
      );

      document.addEventListener('mouseup', () => {
        isDragging = false;
      }, { signal: controller.signal });
    }
  }

  /* ------------------------------------------------------------------ *
   * Geometry helpers
   * ------------------------------------------------------------------ */

  // Page coordinates of the origin used by absolutely positioned children of
  // <body>. This is *not* always (0, 0): a positioned or transformed <body>
  // shifts the containing block, which used to offset every drawn region.
  function getAbsoluteOrigin() {
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:absolute;left:0;top:0;width:0;height:0;margin:0;padding:0;border:0;visibility:hidden;pointer-events:none;';
    document.body.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();
    return { x: rect.left + window.scrollX, y: rect.top + window.scrollY };
  }

  /* ------------------------------------------------------------------ *
   * Screenshots (visible area · selected element · full page)
   * ------------------------------------------------------------------ */

  // Fixed chrome (headers, footers, cookie bars) is trimmed off the top and
  // bottom edges of every stitched tile so it cannot repeat down a full-page
  // capture. The bands this leaves behind are filled by the neighbouring tiles
  // (the scroll step shrinks by the same amount), so nothing is lost.
  const TOP_TRIM_MAX = 120;
  const BOTTOM_TRIM_MAX = 200;
  const MAX_CANVAS_EDGE = 16384; // browser canvas dimension limit
  const MAX_OUTPUT_PIXELS = 64e6; // ~256 MB of canvas memory
  const BIG_OUTPUT_PIXELS = 12e6; // above this, encode JPEG straight away
  const MAX_DATA_URL_CHARS = 6e6; // keep the hand-off under the storage quota
  const CAPTURE_INTERVAL_MS = 550; // captureVisibleTab() allows 2 calls/second

  let isPickingElement = false;
  let isCapturing = false;
  let menuListeners = null;
  let toast = null;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

  function showToast(text) {
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'element-blur-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.hidden = false;
  }

  function hideToast() {
    if (toast) toast.hidden = true;
  }

  // Wait for scroll + layout + paint before looking at the page again.
  function settle() {
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 120)))
    );
  }

  // One viewport capture. Every Element Blur surface hides itself for the shot
  // and comes back afterwards, whatever happens in between.
  async function captureViewportOnce() {
    const surfaces = [document.getElementById(TOOLBAR_ID), overlay, toast].filter(Boolean);
    const visible = surfaces.filter((el) => !el.hidden);
    surfaces.forEach((el) => {
      el.hidden = true;
    });
    try {
      await settle();
      const response = await chrome.runtime.sendMessage({ action: 'element-blur:capture' });
      if (!response || !response.ok) {
        throw new Error((response && response.error) || 'capture failed');
      }
      return response.dataUrl;
    } finally {
      visible.forEach((el) => {
        el.hidden = false;
      });
    }
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('could not decode a captured tile'));
      img.src = dataUrl;
    });
  }

  // Stitches the captured tiles into one image of `target` (page coordinates).
  // Returns a data URL plus the matching file extension.
  function compose(tiles, target, viewportWidth) {
    const widthCss = target.right - target.left;
    const heightCss = target.bottom - target.top;
    const scale = tiles[0].img.naturalWidth / viewportWidth; // image px per CSS px
    // Very long pages are downscaled just enough to stay inside canvas limits.
    const outScale = Math.min(
      scale,
      MAX_CANVAS_EDGE / widthCss,
      MAX_CANVAS_EDGE / heightCss,
      Math.sqrt(MAX_OUTPUT_PIXELS / (widthCss * heightCss))
    );

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(widthCss * outScale));
    canvas.height = Math.max(1, Math.round(heightCss * outScale));
    const ctx = canvas.getContext('2d');

    for (const tile of tiles) {
      const left = Math.max(target.left, tile.scrollX);
      const right = Math.min(target.right, tile.scrollX + viewportWidth);
      const top = Math.max(target.top, tile.bandStart);
      const bottom = Math.min(target.bottom, tile.bandEnd);
      if (right <= left || bottom <= top) continue;
      ctx.drawImage(
        tile.img,
        (left - tile.scrollX) * scale,
        (top - tile.scrollY) * scale,
        (right - left) * scale,
        (bottom - top) * scale,
        (left - target.left) * outScale,
        (top - target.top) * outScale,
        (right - left) * outScale,
        (bottom - top) * outScale
      );
    }

    if (canvas.width * canvas.height > BIG_OUTPUT_PIXELS) {
      return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), extension: 'jpg' };
    }
    const png = canvas.toDataURL('image/png');
    return png.length > MAX_DATA_URL_CHARS
      ? { dataUrl: canvas.toDataURL('image/jpeg', 0.92), extension: 'jpg' }
      : { dataUrl: png, extension: 'png' };
  }

  // Captures a rectangle of the *page* (page coordinates), however tall: it is
  // scrolled under the viewport tile by tile and stitched back together.
  async function capturePageRect(rect, label) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const pageHeight = document.documentElement.scrollHeight;
    const maxScroll = Math.max(0, pageHeight - viewportHeight);

    const topTrim = Math.min(TOP_TRIM_MAX, Math.round(viewportHeight * 0.15));
    const bottomTrim = Math.min(BOTTOM_TRIM_MAX, Math.round(viewportHeight * 0.22));
    const step = Math.max(80, viewportHeight - topTrim - bottomTrim);

    const target = {
      left: Math.max(0, rect.x),
      top: Math.max(0, rect.y),
      right: Math.min(window.scrollX + viewportWidth, rect.x + rect.width),
      bottom: Math.min(pageHeight, rect.y + rect.height),
    };
    if (target.right - target.left <= 0 || target.bottom - target.top <= 0) {
      throw new Error('nothing to capture');
    }

    // Already fully on screen? Then one tile and no scrolling at all.
    const fitsNow =
      target.top >= window.scrollY &&
      target.bottom <= window.scrollY + viewportHeight &&
      target.left >= window.scrollX &&
      target.right <= window.scrollX + viewportWidth;

    const originalScroll = window.scrollY;
    const tiles = [];
    let drawnBottom = target.top;

    try {
      let nextScroll = fitsNow ? originalScroll : clamp(target.top - topTrim, 0, maxScroll);
      for (;;) {
        window.scrollTo({ top: nextScroll, left: window.scrollX, behavior: 'instant' });
        await settle();

        const scrollY = window.scrollY;
        const scrollX = window.scrollX;
        const img = await loadImage(await captureViewportOnce());

        // The last tile may use its full height (there is no neighbouring tile
        // to refill a trimmed band); every other tile loses `bottomTrim` so a
        // fixed footer or cookie bar cannot repeat down the image.
        const isLast = scrollY + viewportHeight >= target.bottom || scrollY >= maxScroll;
        const bandStart = Math.max(
          target.top,
          tiles.length ? scrollY + topTrim : target.top,
          drawnBottom
        );
        const bandEnd = Math.min(target.bottom, scrollY + viewportHeight - (isLast ? 0 : bottomTrim));

        tiles.push({ img, scrollX, scrollY, bandStart, bandEnd });
        drawnBottom = Math.max(drawnBottom, bandEnd);
        if (tiles.length > 1) showToast(`${label} — ${tiles.length} tiles`);

        if (bandEnd >= target.bottom || scrollY >= maxScroll) break;
        nextScroll = Math.min(scrollY + step, maxScroll);
        await sleep(CAPTURE_INTERVAL_MS); // captureVisibleTab() rate limit
      }

      showToast('Rendering…');
      return compose(tiles, target, viewportWidth);
    } finally {
      window.scrollTo({ top: originalScroll, left: window.scrollX, behavior: 'instant' });
    }
  }

  async function runCapture(kind, element) {
    if (isCapturing) return;
    isCapturing = true;
    closeScreenshotMenu();
    try {
      let rect;
      let label;
      if (kind === 'element') {
        const box = element.getBoundingClientRect();
        rect = {
          x: box.left + window.scrollX,
          y: box.top + window.scrollY,
          width: box.width,
          height: box.height,
        };
        label = 'Element';
      } else if (kind === 'fullpage') {
        rect = {
          x: window.scrollX,
          y: 0,
          width: window.innerWidth,
          height: document.documentElement.scrollHeight,
        };
        label = 'Full page';
      } else {
        rect = {
          x: window.scrollX,
          y: window.scrollY,
          width: window.innerWidth,
          height: window.innerHeight,
        };
        label = 'Visible area';
      }

      showToast(`Capturing ${label.toLowerCase()}…`);
      const { dataUrl, extension } = await capturePageRect(rect, label);
      showToast('Opening screenshot…');
      const response = await chrome.runtime.sendMessage({
        action: 'element-blur:open-viewer',
        payload: {
          dataUrl,
          filename: `element-blur-${kind}-${timestamp()}.${extension}`,
        },
      });
      if (!response || !response.ok) {
        throw new Error((response && response.error) || 'could not open the screenshot viewer');
      }
    } catch (error) {
      console.warn('Element Blur: capture failed.', error);
      showToast('Screenshot failed — see the console for details');
      await sleep(2500);
    } finally {
      hideToast();
      isCapturing = false;
    }
  }

  function openScreenshotMenu() {
    if (menuListeners) {
      closeScreenshotMenu();
      return;
    }
    const host = document.getElementById(TOOLBAR_ID);
    if (!host) return;

    const menu = document.createElement('div');
    menu.id = 'element-blur-shot-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button type="button" role="menuitem" data-shot="viewport">Visible area</button>
      <button type="button" role="menuitem" data-shot="element">Selected element…</button>
      <button type="button" role="menuitem" data-shot="fullpage">Full page</button>`;
    host.appendChild(menu);

    menuListeners = new AbortController();

    menu.addEventListener('click', (event) => {
      const button = closestIn(event.target, '[data-shot]');
      if (!button) return;
      const kind = button.dataset.shot;
      closeScreenshotMenu();
      if (kind === 'element') startElementPick();
      else runCapture(kind);
    });

    // Any click outside the toolbar closes the menu again.
    document.addEventListener(
      'click',
      (event) => {
        if (!isToolbarTarget(event.target)) closeScreenshotMenu();
      },
      { capture: true, signal: menuListeners.signal }
    );
  }

  function closeScreenshotMenu() {
    const menu = document.getElementById('element-blur-shot-menu');
    if (menu) menu.remove();
    if (menuListeners) {
      menuListeners.abort();
      menuListeners = null;
    }
  }

  function startElementPick() {
    isPickingElement = true;
    isSelecting = false;
    isDrawing = false;
    isSelectingText = false;
    restoreBodyStyle('user-select');
    setBodyStyle('cursor', 'crosshair');
    showToast('Click an element to capture it — Esc to cancel');
  }

  /* ------------------------------------------------------------------ *
   * Page interaction
   * ------------------------------------------------------------------ */

  // Hover preview while in element-select or element-pick mode
  document.addEventListener('mousemove', (event) => {
    if (!isSelecting && !isPickingElement) return;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (element && !isToolbarTarget(element)) {
      highlightElement(element);
    }
  });

  document.addEventListener(
    'click',
    (event) => {
      if (!isSelecting && !isPickingElement) return;
      // Toolbar clicks must keep working while a mode is armed — swallow nothing
      // and let the button handle its own click.
      if (isToolbarTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();

      const element = document.elementFromPoint(event.clientX, event.clientY);

      // Element pick (screenshots): capture what was clicked and stop there.
      if (isPickingElement) {
        isPickingElement = false;
        exitSelectMode();
        hideToast();
        if (element) runCapture('element', element);
        return;
      }

      if (element && !isToolbarTarget(element)) {
        if (element.classList.contains('blur-region') || element.classList.contains('highlight-region')) {
          trackBlurAction(element, element.classList.contains('blur-region') ? 'region' : 'highlight-region');
          element.remove();
        } else if (isHighlightMode) {
          element.classList.toggle('highlighted');
          if (element.classList.contains('highlighted')) {
            trackBlurAction(element, 'highlighted');
          }
        } else {
          element.classList.toggle('blurred');
          if (element.classList.contains('blurred')) {
            trackBlurAction(element, 'blurred');
          }
        }
      }
      exitSelectMode();
    },
    true
  );

  // Draw region handlers
  document.addEventListener('mousedown', (event) => {
    if (!isDrawing || isToolbarTarget(event.target)) return;
    const origin = getAbsoluteOrigin();
    originX = origin.x;
    originY = origin.y;
    startX = event.pageX - originX;
    startY = event.pageY - originY;
    region = document.createElement('div');
    region.className = isHighlightMode ? 'highlight-region' : 'blur-region';
    region.style.left = `${startX}px`;
    region.style.top = `${startY}px`;
    document.body.appendChild(region);
  });

  document.addEventListener('mousemove', (event) => {
    if (!region || !isDrawing) return;
    const x = event.pageX - originX;
    const y = event.pageY - originY;
    const width = Math.abs(x - startX);
    const height = Math.abs(y - startY);
    region.style.width = `${width}px`;
    region.style.height = `${height}px`;
    region.style.left = `${Math.min(x, startX)}px`;
    region.style.top = `${Math.min(y, startY)}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!isDrawing) return;
    isDrawing = false;
    if (region) {
      // Only track if region has a size (not a click)
      const width = parseInt(region.style.width || '0', 10);
      const height = parseInt(region.style.height || '0', 10);
      if (width > 0 && height > 0) {
        const actionType = region.classList.contains('highlight-region') ? 'highlight-region' : 'region';
        trackBlurAction(region, actionType);
      } else {
        // Remove accidental zero-size region
        region.remove();
      }
    }
    removeOverlay();
    region = null;
  });

  // Text selection handler
  document.addEventListener('mouseup', () => {
    if (!isSelectingText) return;
    const selection = window.getSelection();
    if (selection.rangeCount === 0 || selection.isCollapsed) return;

    // Never wrap the toolbar's own text.
    const anchor = selection.anchorNode;
    const anchorElement =
      anchor && anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor && anchor.parentElement;
    if (isToolbarTarget(anchorElement)) return;

    const range = selection.getRangeAt(0);

    // Create a span to wrap the selected text
    const span = document.createElement('span');
    span.className = isHighlightMode ? 'highlight-text' : 'blur-text';

    try {
      // Extract the selected content and wrap it
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);

      // Track for undo
      trackBlurAction(span, isHighlightMode ? 'text-highlight' : 'text-blur');

      // Clear the selection and exit text selection mode
      selection.removeAllRanges();
      isSelectingText = false;
      restoreBodyStyle('cursor');
      restoreBodyStyle('user-select');
    } catch (error) {
      console.warn('Element Blur: could not blur the selected text.', error);
    }
  });

  // Listen for Escape key to cancel modes
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (menuListeners) {
      closeScreenshotMenu();
      return;
    }
    if (isPickingElement) {
      isPickingElement = false;
      exitSelectMode();
      hideToast();
      return;
    }
    if (isSelecting) {
      exitSelectMode();
    } else if (isDrawing) {
      // Drop the half-drawn region instead of leaving a zero-size div behind.
      if (region) {
        region.remove();
        region = null;
      }
      isDrawing = false;
      removeOverlay();
    } else if (isSelectingText) {
      isSelectingText = false;
      removeOverlay();
    }
  });

  /* ------------------------------------------------------------------ *
   * Messaging
   * ------------------------------------------------------------------ */

  // Extension-private channel from background.js — replaces the old
  // window.postMessage bridge, which any page script could spoof.
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (!request || request.type !== 'element-blur:toggle-toolbar') return;
    toggleToolbar();
    sendResponse({ ok: true });
  });

  updateBlurStyle();
})();
