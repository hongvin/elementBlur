# Element Blur & Highlight Extension

_(formally Element Blur)_

A simple and user-friendly browser extension that allows you to blur or highlight elements on any webpage. Perfect for hiding sensitive information, emphasizing important content, or creating visual focus.

https://github.com/user-attachments/assets/45111326-2c45-40f4-91bb-e3b54f87344b



## Features
- **Dual Mode**: Switch between blur and highlight modes with a single click
- **Element Selection**: Select and blur/highlight any element on a webpage
- **Region Drawing**: Draw custom rectangular regions to blur or highlight
- **Text Selection**: Select and blur/highlight specific text
- **Color Picker**: Choose any highlight color you want (default: yellow)
- **Opacity Control**: Adjust blur intensity or highlight opacity with a slider
- **Undo/Redo**: Easily undo recent actions
- **Clear All**: Remove all effects at once
- **Screenshot**: Capture the current page state
- **Draggable Toolbar**: Move the toolbar anywhere on the page
- Lightweight and privacy-friendly

## Installation
1. Download or clone this repository. 
2. Open your browser's extensions page (e.g., `chrome://extensions/` for Chrome).
3. Enable "Developer mode" (usually a toggle in the top right).
4. Click "Load unpacked" and select the extension folder.

## Usage
1. Click the extension icon in your browser toolbar to show/hide the toolbar.
2. **Switch Mode**: Click the mode toggle button (🌫️ for blur, 🖍️ for highlight)
3. **Select Element**: Click the select button, then click any element to blur/highlight it
4. **Draw Region**: Click the draw button, then drag to create a blur/highlight region
5. **Select Text**: Click the text button, then select text to blur/highlight
6. **Color Picker**: In highlight mode, choose your preferred highlight color
7. **Adjust Intensity/Opacity**: Use the slider to control blur intensity (blur mode) or opacity (highlight mode)
8. **Undo**: Click undo to remove the last action
9. **Clear All**: Remove all blurs and highlights at once
10. **Screenshot**: Capture the page with all effects applied

## Files
- `manifest.json`: Extension configuration
- `background.js`: Background script and toolbar UI
- `content.js`: Main logic for blurring and highlighting elements
- `toolbar.html`, `toolbar.css`: Toolbar UI
- `images/`: Extension icons

## License
MIT License

---

Consider buying me a coffee

<a href="https://www.buymeacoffee.com/hongvin" target="_blank">
<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" />
</a>

*Created with ❤️ for privacy and productivity.*
