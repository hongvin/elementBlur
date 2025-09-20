let isSelecting = false;
let isDrawing = false;
let isSelectingText = false;
let blurIntensity = 5;
let startX, startY;
let region;
let overlay;
let lastHighlightedElement = null;
let blurHistory = [];
let originalUserSelect = '';

// Patch blur toggling to track history
function trackBlurAction(element, action) {
  if (!element) return;
  blurHistory.push({ element, action });
}

const style = document.createElement('style');
document.head.appendChild(style);

function createOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'blur-mode-overlay';
    document.body.appendChild(overlay);
    document.body.style.cursor = 'crosshair';
}

function removeOverlay() {
    if (overlay) {
        overlay.remove();
        overlay = null;
    }
    document.body.style.cursor = 'default';
    // Remove any remaining highlights
    if (lastHighlightedElement) {
        lastHighlightedElement.classList.remove('element-highlight');
        lastHighlightedElement = null;
    }
    // Restore text selection if it was disabled
    if (isSelectingText && originalUserSelect !== '') {
        document.body.style.userSelect = originalUserSelect;
        originalUserSelect = '';
    }
    isSelecting = false;
    isDrawing = false;
    isSelectingText = false;
}

function exitSelectMode() {
    document.body.style.cursor = 'default';
    // Remove any remaining highlights
    if (lastHighlightedElement) {
        lastHighlightedElement.classList.remove('element-highlight');
        lastHighlightedElement = null;
    }
    isSelecting = false;
}

// Removed cleanupAllModes - using simpler approach

function highlightElement(element) {
    // Remove previous highlight
    if (lastHighlightedElement) {
        lastHighlightedElement.classList.remove('element-highlight');
    }
    
    // Add highlight to new element
    if (element && element !== overlay && !element.closest('#blur-toolbar-container')) {
        element.classList.add('element-highlight');
        lastHighlightedElement = element;
    }
}

function updateBlurStyle() {
  style.textContent = `
    .blurred:not(#blur-toolbar-container):not(#blur-toolbar):not(#blur-toolbar *) { 
      filter: blur(${blurIntensity}px); 
    }
    .blur-region {
      position: absolute;
      background-color: rgba(0, 0, 0, 0.01);
      backdrop-filter: blur(${blurIntensity}px);
      z-index: 99999;
      pointer-events: auto;
      cursor: pointer;
    }
    .blur-text {
      color: transparent !important;
      text-shadow: 0 0 ${blurIntensity}px rgba(0,0,0,0.5) !important;
      background: rgba(0,0,0,0.1) !important;
      border-radius: 2px !important;
    }
    /* Ensure toolbar and its children are always on top and never affected */
    #blur-toolbar-container {
      position: fixed !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      filter: none !important;
    }
    #blur-toolbar-container *, #blur-toolbar, #blur-toolbar * {
      filter: none !important;
      pointer-events: auto !important;
      z-index: 2147483647 !important;
    }
    #blur-mode-overlay {
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
  `;
}

function setupToolbarEventListeners() {
  const selectBtn = document.getElementById('toolbar-select-element');
  const drawBtn = document.getElementById('toolbar-draw-region');
  const clearBtn = document.getElementById('toolbar-clear-all');
  const undoBtn = document.getElementById('toolbar-undo');
  const intensitySlider = document.getElementById('toolbar-blur-intensity');
  const screenshotBtn = document.getElementById('toolbar-screenshot');
  const closeBtn = document.getElementById('toolbar-close');
  const dragHandle = document.getElementById('toolbar-drag-handle');
  const toolbar = document.getElementById('blur-toolbar');


  if (selectBtn) {
    selectBtn.addEventListener('click', () => {
      isSelecting = true;
      isDrawing = false;
      isSelectingText = false;
      document.body.style.cursor = 'crosshair';
    });
  }

  // Select text button logic
  const selectTextBtn = document.getElementById('toolbar-select-text');
  if (selectTextBtn) {
    selectTextBtn.addEventListener('click', () => {
      isSelectingText = true;
      isSelecting = false;
      isDrawing = false;
      document.body.style.cursor = 'text';
      // Enable text selection
      originalUserSelect = getComputedStyle(document.body).userSelect;
      document.body.style.userSelect = 'text';
    });
  }

  // Undo button logic
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      // Remove the most recent blur action
      while (blurHistory.length > 0) {
        const last = blurHistory.pop();
        if (!last || !last.element) continue;
        if (last.action === 'blurred') {
          last.element.classList.remove('blurred');
          break;
        } else if (last.action === 'region') {
          if (last.element.parentNode) {
            last.element.remove();
            break;
          }
        } else if (last.action === 'text-blur') {
          // For text blur, we need to unwrap the span and restore original text
          const span = last.element;
          if (span.parentNode) {
            // Move all child nodes before the span
            while (span.firstChild) {
              span.parentNode.insertBefore(span.firstChild, span);
            }
            // Remove the empty span
            span.remove();
          }
          break;
        }
      }
    });
  }

  if (drawBtn) {
    drawBtn.addEventListener('click', () => {
      isDrawing = true;
      isSelecting = false;
      isSelectingText = false;
      createOverlay();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      document.querySelectorAll('.blurred').forEach(el => el.classList.remove('blurred'));
      document.querySelectorAll('.blur-region').forEach(el => el.remove());
      document.querySelectorAll('.blur-text').forEach(el => el.classList.remove('blur-text'));
      blurHistory = [];
      removeOverlay();
    });
  }

  if (intensitySlider) {
    intensitySlider.addEventListener('input', (e) => {
      blurIntensity = e.target.value;
      updateBlurStyle();
      document.querySelectorAll('.blur-region').forEach(r => {
        r.style.backdropFilter = `blur(${blurIntensity}px)`;
      });
    });
  }

  if (screenshotBtn) {
    screenshotBtn.addEventListener('click', () => {
      // Hide toolbar and overlay before taking screenshot
      const toolbar = document.getElementById('blur-toolbar-container');
      const overlay = document.getElementById('blur-mode-overlay');
      
      if (toolbar) toolbar.style.display = 'none';
      if (overlay) overlay.style.display = 'none';
      
      // Take screenshot after a brief delay to ensure elements are hidden
      setTimeout(() => {
        chrome.runtime.sendMessage({ action: 'toolbar-screenshot' });
        
        // Show toolbar and overlay again after screenshot
        setTimeout(() => {
          if (toolbar) toolbar.style.display = 'block';
          if (overlay) overlay.style.display = 'block';
        }, 500);
      }, 100);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const toolbar = document.getElementById('blur-toolbar-container');
      if (toolbar) toolbar.remove();
      removeOverlay();
    });
  }

  // Make toolbar draggable
  if (dragHandle && toolbar) {
    const toolbarContainer = document.getElementById('blur-toolbar-container');
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      const rect = toolbarContainer.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging && !isSelecting && !isDrawing) {
        const x = e.clientX - dragOffset.x;
        const y = e.clientY - dragOffset.y;
        
        // Keep toolbar within viewport bounds
        const maxX = window.innerWidth - toolbarContainer.offsetWidth;
        const maxY = window.innerHeight - toolbarContainer.offsetHeight;
        
        toolbarContainer.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
        toolbarContainer.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
        toolbarContainer.style.right = 'auto'; // Remove right positioning
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }
}

// Simple global event handlers
document.addEventListener('mousemove', (event) => {
  if (!isSelecting) return;
  
  const element = document.elementFromPoint(event.clientX, event.clientY);
  if (element && !element.closest('#blur-toolbar-container')) {
    highlightElement(element);
  }
});

document.addEventListener('click', (event) => {
  if (isSelecting) {
    event.preventDefault();
    event.stopPropagation();
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (element && !element.closest('#blur-toolbar-container')) {
      if (element.classList.contains('blur-region')) {
        trackBlurAction(element, 'region');
        element.remove();
      } else {
        element.classList.toggle('blurred');
        if (element.classList.contains('blurred')) {
          trackBlurAction(element, 'blurred');
        }
      }
    }
    exitSelectMode();
    return false;
  }
}, true);

// Draw region handlers
document.addEventListener('mousedown', (event) => {
  if (isDrawing) {
    startX = event.pageX;
    startY = event.pageY;
    region = document.createElement('div');
    region.className = 'blur-region';
    region.style.left = `${startX}px`;
    region.style.top = `${startY}px`;
    document.body.appendChild(region);
  }
});

document.addEventListener('mousemove', (event) => {
  if (region && isDrawing) {
    const width = Math.abs(event.pageX - startX);
    const height = Math.abs(event.pageY - startY);
    const left = Math.min(event.pageX, startX);
    const top = Math.min(event.pageY, startY);
    region.style.width = `${width}px`;
    region.style.height = `${height}px`;
    region.style.left = `${left}px`;
    region.style.top = `${top}px`;
  }
});

document.addEventListener('mouseup', (event) => {
  if (isDrawing) {
    isDrawing = false;
    if (region) {
      // Only track if region has a size (not a click)
      const width = parseInt(region.style.width || '0');
      const height = parseInt(region.style.height || '0');
      if (width > 0 && height > 0) {
        trackBlurAction(region, 'region');
      } else {
        // Remove accidental zero-size region
        region.remove();
      }
    }
    removeOverlay();
    region = null;
  }
});

// Text selection handler
document.addEventListener('mouseup', (event) => {
  if (isSelectingText) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      
      // Create a span to wrap the selected text
      const span = document.createElement('span');
      span.className = 'blur-text';
      
      try {
        // Extract the selected content and wrap it
        const contents = range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
        
        // Track for undo
        trackBlurAction(span, 'text-blur');
        
        // Clear the selection and exit text selection mode
        selection.removeAllRanges();
        isSelectingText = false;
        document.body.style.cursor = 'default';
        if (originalUserSelect !== '') {
          document.body.style.userSelect = originalUserSelect;
          originalUserSelect = '';
        }
      } catch (error) {
        console.warn('Could not blur selected text:', error);
      }
    }
  }
});

// Listen for Escape key to cancel modes
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (isSelecting) {
            exitSelectMode();
        } else if (isDrawing) {
            removeOverlay();
        } else if (isSelectingText) {
            removeOverlay();
        }
    }
});

updateBlurStyle();

// Listen for messages from the injected script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data.type === 'SETUP_TOOLBAR') {
    setupToolbarEventListeners();
  }
});

document.addEventListener('click', (event) => {
  if (isSelecting) {
    event.preventDefault();
    event.stopPropagation();
    // Find the real target under the overlay
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (target && target.id !== 'blur-mode-overlay') {
        target.classList.toggle('blurred');
    }
    removeOverlay();
  }
}, true);

document.addEventListener('mousedown', (event) => {
  if (isDrawing) {
    startX = event.pageX;
    startY = event.pageY;
    region = document.createElement('div');
    region.className = 'blur-region';
    region.style.left = `${startX}px`;
    region.style.top = `${startY}px`;
    document.body.appendChild(region);
  }
});

document.addEventListener('mousemove', (event) => {
  if (region) {
    const width = Math.abs(event.pageX - startX);
    const height = Math.abs(event.pageY - startY);
    const left = Math.min(event.pageX, startX);
    const top = Math.min(event.pageY, startY);
    region.style.width = `${width}px`;
    region.style.height = `${height}px`;
    region.style.left = `${left}px`;
    region.style.top = `${top}px`;
  }
});

document.addEventListener('mouseup', (event) => {
  if (isDrawing) {
    isDrawing = false;
    removeOverlay();
    region = null;
  }
});

// Listen for Escape key to cancel modes
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        removeOverlay();
    }
});
