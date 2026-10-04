# Element Blur & Highlight

_(formerly Element Blur)_

A lightweight, zero-dependency browser extension that lets you **blur or highlight** anything on a webpage — elements, hand-drawn regions, or just a run of text. Built for hiding sensitive information while presenting, emphasizing content, or simply taking cleaner annotated screenshots.

https://github.com/user-attachments/assets/45111326-2c45-40f4-91bb-e3b54f87344b

---

## Features

| Feature | Description |
| --- | --- |
| **Dual mode** | Toggle between 🌫️ Blur and 🖍️ Highlight with one click |
| **Element selection** | Click any element on the page to blur or highlight it |
| **Region drawing** | Drag out arbitrary rectangular regions to blur or highlight |
| **Text selection** | Select a run of text and apply the effect just to that text |
| **Color picker** | Any highlight color (default yellow) — shown in highlight mode |
| **Intensity / opacity slider** | Blur radius or highlight opacity, live-adjustable (`0–20`) |
| **Undo** | Steps back through your last actions one at a time |
| **Clear all** | Removes every blur and highlight at once |
| **Screenshot — visible area** | Grabs the current viewport with all effects applied |
| **Screenshot — selected element** | Hover to highlight an element, click to capture just that element as an image |
| **Screenshot — full page** | Stitches the whole scrollable page into one tall image |
| **Screenshot viewer** | Every capture opens in a viewer tab with a **Download** button (the toolbar hides itself for the shot) |
| **Draggable toolbar** | Drag it by the handle anywhere within the viewport |
| **Esc to cancel** | Cancels element-select, region-draw or text-select mode |

### Non-goals

- No accounts, no analytics, no network requests — see [Privacy](#privacy).
- No build step, no bundler, no npm packages: the extension is plain JavaScript you can read in full.

## Installation

1. Download or clone this repository.
2. Open your browser's extensions page:
   - Chrome / Brave / Edge: `chrome://extensions/` (Edge: `edge://extensions/`)
3. Enable **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select this folder (the one containing `manifest.json`).

> Requires a Chromium-based browser with **Manifest V3** support (Chrome 88+, and effectively any Chrome/Edge/Brave from 2022 onwards).

## Usage

1. Click the extension icon in the browser toolbar to **show or hide** the toolbar on the current page.
2. **Mode** (`🌫️` / `🖍️`) — switch between blur and highlight. The color picker appears in highlight mode.
3. **Select element** — then click an element to apply the effect. Clicking an existing region with this tool removes it.
4. **Draw region** — then drag a rectangle. Press `Esc` to cancel.
5. **Select text** — then drag over text to apply the effect to just that text.
6. **Color** — pick the highlight color (also recolors everything you already highlighted).
7. **Slider** — blur radius in blur mode, highlight opacity in highlight mode.
8. **Screenshot** (`📷`) — opens a menu with three capture targets:
   - **Visible area** — the current viewport, exactly as you see it.
   - **Selected element…** — hover to highlight an element, then click to capture just it (elements taller than the screen are stitched too). `Esc` cancels.
   - **Full page** — the entire scrollable page stitched into one tall image.

   Every capture opens in a viewer tab with a **Download** button.
9. **Undo** / **Clear** — step back one action, or wipe everything.
10. **Close** (`×`) — removes the toolbar and any leftover overlay.

## How it works

| File | Role |
| --- | --- |
| [`manifest.json`](manifest.json) | Manifest V3 config — `activeTab` + `scripting` + `storage` |
| [`background.js`](background.js) | Service worker: injects the content script on demand and captures screenshots |
| [`content.js`](content.js) | Everything that touches the page: effects, interactions and the toolbar |
| [`viewer.html`](viewer.html), [`viewer.js`](viewer.js) | In-extension screenshot viewer (preview + download) |
| [`toolbar.html`](toolbar.html), [`toolbar.css`](toolbar.css) | Legacy toolbar markup/styles — unused (superseded by the toolbar in [`content.js`](content.js)) |
| [`images/`](images) | Extension icons (16/64/128 px) |

There is **no build step** and **no dependency tree** — `node --check background.js && node --check content.js && node --check viewer.js` is the whole "compile".

## Privacy

- No data leaves your browser. The extension makes **zero network requests**.
- The content script is injected **only** when you click the extension icon, and only into the tab you are looking at (`activeTab`) — nothing runs on pages you are just browsing.
- Effects are pure CSS/DOM and are discarded when you reload or navigate away from the page. Screenshots are handed to the viewer tab through in-memory `chrome.storage.session` and deleted as soon as they are read.

> ⚠️ **Blur is visual, not cryptographic.** A blurred element is still in the DOM — its text can still be copied, read by other extensions, or viewed in DevTools. Use it for presentations and screenshots, not for redacting secrets that must never be recoverable.

## Browser support

- **Chrome / Brave / Edge / other Chromium**: supported (Manifest V3, `chrome.*` APIs).
- **Firefox**: not currently supported — MV3 background is declared as a service worker and Firefox expects `background.scripts` / an event page. Contributions welcome (see [IMPROVEMENTS.md](IMPROVEMENTS.md)).

## Known limitations

- Effects do **not** survive a page reload or navigation.
- Text spanning block boundaries or inline elements can fail to wrap cleanly.
- Full-page and tall captures are **stitched from scrolled tiles**, so content that lazy-loads while scrolling can show seams, and floating widgets (chat bubbles, sticky sidebars) may repeat down the image. Fixed headers and footers/cookie bars are trimmed automatically.
- Captures cover the **visible width** of the page only (there is no horizontal stitching).
- Very tall pages are downscaled slightly so the result stays inside browser canvas limits (~16k px per side); output is PNG, or JPEG when the image would otherwise be too large to hand to the viewer.

## Roadmap

A full, prioritized maintenance and improvement audit lives in [IMPROVEMENTS.md](IMPROVEMENTS.md) — accessibility, persistence, region editing, cross-browser support and other feature ideas.

## Changelog

### 1.3 — capture modes

- The screenshot button now opens a menu: **Visible area**, **Selected element…** and **Full page**.
- **Element screenshots**: hover to highlight any element and click to capture exactly that element — including elements taller than the screen.
- **Full-page screenshots**: the whole scrollable page is scrolled under the camera tile by tile and stitched into one image, with fixed headers and footers/cookie bars trimmed so they cannot repeat.
- Captures are composed at the capture's native resolution and downscaled only when a page is too tall for a canvas.

### 1.2 — bug-fix release

- Toolbar buttons now keep working while element-select mode is armed (clicks were being swallowed).
- "Clear All" no longer leaves empty `<span>` wrappers in the host page's DOM.
- Highlights no longer dim the text they are meant to emphasize (transparency moved from `opacity` into the color).
- Screenshot opens in a reliable viewer tab with a download button, instead of navigating to a `data:` URL.
- Drawn regions are positioned correctly on pages with a positioned or transformed `<body>`.
- The toolbar is wired through extension messaging instead of a spoofable `window.postMessage` bridge.
- Body `cursor` / `user-select` styles are saved and restored exactly, instead of leaving inline overrides on the page.
- The content script is injected on demand (no more `<all_urls>`), so the extension only touches pages you use it on.

## Development

```
elementBlur/
├── manifest.json     # MV3 manifest
├── background.js     # service worker (on-demand injection, screenshot capture)
├── content.js        # content script (toolbar, effects, all editing behaviour)
├── viewer.html/.js   # screenshot viewer tab
├── toolbar.html/.css # legacy, unused
└── images/           # icons
```

Load the folder unpacked (see [Installation](#installation)), then use the browser's **Reload** button on `chrome://extensions/` after every edit. For debugging: right-click the toolbar → *Inspect* for the page console, and *Inspect views: service worker* on the extension card for the background console.

## License

MIT License (a `LICENSE` file is still to be added to the repository).

---

Consider buying me a coffee

<a href="https://www.buymeacoffee.com/hongvin" target="_blank">
<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" />
</a>

*Created with ❤️ for privacy and productivity.*
