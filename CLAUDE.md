# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) that saves all open browser tabs to organized bookmarks, allowing users to "declare tab bankruptcy."

## Installation & Testing

Load extension in Chrome:
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this directory

After code changes, click the reload icon on the extension card at `chrome://extensions/`

For `file://` tab support, Chrome also requires the per-extension **Allow access to file URLs** toggle:
1. Navigate to `chrome://extensions/`
2. Open the Tab Bankruptcy extension details
3. Enable **Allow access to file URLs**

## Release Policy

- Source-only updates via git; do not create release bundles or build artifacts.
- For user-facing behavior changes, increment `manifest.json` using semantic versioning.
- Record versioned changes in `CHANGELOG.md`.

## Architecture

**Message Passing Pattern**:
- `popup.js` (UI) sends messages to `background.js` (service worker) via `chrome.runtime.sendMessage()`
- `background.js` handles all bookmark/tab operations asynchronously
- Results passed back to popup for user feedback

**Core Flow**:
1. User clicks "Declare Bankruptcy" in popup
2. Popup sends `{action: 'declareBankruptcy', closeTabs, currentWindowOnly}` message
3. Background script (`handleBankruptcy()`) executes:
   - Counts valid tabs (filters chrome://, edge://, etc.)
   - Creates/reuses top-level 'tab-bankruptcy' folder at index 0 in Bookmarks Bar
   - Creates timestamped subfolder: `{ISO8601}-{windowCount}w-{tabCount}t`
   - Creates Window subfolders (Window 1, Window 2, etc.)
   - Saves each valid tab as bookmark
   - Optionally closes tabs (ensures ≥1 tab remains to prevent closing browser)

**Bookmark Structure**:
```
Bookmarks Bar/
└── tab-bankruptcy/                     (persistent, always at index 0)
    └── 2025-10-05T10:30:00Z-3w-45t/   (timestamp-windows-tabs)
        ├── Window 1/
        ├── Window 2/
        └── Window 3/
```

## Key Implementation Details

**Top-Level Folder Management** (`getOrCreateTopLevelFolder()` in background.js:11-45):
- Searches Bookmarks Bar (id='1') for existing 'tab-bankruptcy' folder
- Creates at index 0 if new
- Moves to index 0 if exists but not first
- Returns folder for use as parent

**URL Validation** (`isValidUrl()` in background.js:159-175):
- Filters out chrome://, chrome-extension://, edge://, about:, data:
- Includes file:// URLs so local file tabs are counted, bookmarked, and optionally closed when Chrome exposes them to the extension
- Requires Chrome's per-extension **Allow access to file URLs** setting for file:// behavior
- Only valid URLs are counted and bookmarked

**Tab Closing Safety** (background.js:124-140):
- If closing all tabs in current window, creates new tab first
- Prevents accidentally closing the browser entirely

## Regenerating Icons

Icons are in `icons/` directory. To regenerate from SVG:

```bash
cd icons
magick icon.svg -resize 16x16 icon16.png
magick icon.svg -resize 48x48 icon48.png
magick icon.svg -resize 128x128 icon128.png
```

## Permissions Required

- `bookmarks`: Create/manage bookmark folders and items
- `tabs`: Query open tabs and windows, close tabs
- Chrome extension details toggle: **Allow access to file URLs** for local file tabs

## Common Issues

**Extension not loading**: Check manifest.json syntax, verify all referenced files exist
**Bookmarks not saving**: Check console at `chrome://extensions/` → extension details → service worker "inspect views"
**File tabs left behind**: Enable **Allow access to file URLs** on the extension details page at `chrome://extensions/`
**Tabs not closing**: Verify "Close tabs after saving" checkbox state, check browser console for errors
