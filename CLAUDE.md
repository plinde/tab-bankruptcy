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

Run the unit tests (pure logic, no browser required) with:

```bash
npm test   # node --test — covers bookmarks-bar.js resolution
```

## Architecture

**Message Passing Pattern**:
- `popup.js` (UI) sends messages to `background.js` (service worker) via `chrome.runtime.sendMessage()`
- `background.js` handles all bookmark/tab operations asynchronously
- Results passed back to popup for user feedback

**Profile Scope Disclosure** (`updateProfileDisclosure()` in popup.js):
- The popup shows `Running as: <account-email>` for the current profile, plus a
  static warning that other profiles are unaffected and must be run separately
- Email comes from `chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' })`
  (needs the `identity` permission); falls back to `chrome.identity
  .getProfileUserInfo(callback)` on older Chrome, then to the not-signed-in text
- Runs independently of `updateStats()` — a slow/denied identity lookup never
  blocks the tab/window counts; any failure degrades to the not-signed-in text
- Display text is produced by the pure `formatProfileDisclosure()` in
  `profile-disclosure.js`, unit-tested in `profile-disclosure.test.js`
- Hard limits (Chrome sandbox): the extension **cannot** enumerate other profiles,
  read their display names, or count their tabs/windows — do not attempt it

**Core Flow**:
1. User clicks "Declare Bankruptcy" in popup
2. Popup sends `{action: 'declareBankruptcy', closeTabs, currentWindowOnly}` message
3. Background script (`handleBankruptcy()`) executes:
   - Plans which windows to save via `planBankruptcyWindows()` — only windows
     with ≥1 bookmarkable tab are kept; empty windows are dropped so no empty
     `Window N` folder is created, and survivors are renumbered sequentially
   - If no window in scope has any bookmarkable tab, returns a "No bookmarkable
     tabs found" message and creates no timestamped folder / closes no tabs
   - Creates/reuses top-level 'tab-bankruptcy' folder at index 0 in Bookmarks Bar
   - Creates timestamped subfolder: `{ISO8601}-{windowCount}w-{tabCount}t`, where
     the counts reflect windows/tabs actually saved
   - Creates a Window subfolder per saved window (Window 1, Window 2, …)
   - Saves each valid tab as bookmark
   - Optionally closes tabs (ensures ≥1 tab remains to prevent closing browser)

**Window Planning** (`planBankruptcyWindows()` in `bankruptcy-plan.js`):
- Pure function (no `chrome.*`) shared with the service worker via `importScripts`
  and unit-tested in `bankruptcy-plan.test.js` (`npm test`)
- Takes each window's tab list + `isValidUrl`; returns `{ windowNumber, tabs }`
  entries for only the non-empty windows, numbered sequentially from 1

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

**Bookmarks Bar Resolution** (`resolveBookmarksBar()` in `bookmarks-bar.js`):
- Locates the writable Bookmarks Bar in the active Chrome profile, robust to
  account (synced) bookmarks, local (device) bookmarks, or both
- Primary signal: `folderType === 'bookmarks-bar'` (Chrome 134+, id-independent)
- Precedence when multiple bars exist: prefer the account/synced bar
  (`syncing === true`), then local, then document order
- Legacy fallback for older Chrome: the permanent node with id `'1'`
- Returns `null` (caller throws `Could not find Bookmarks Bar`) only when no bar
  resolves by any strategy
- Pure function with no `chrome.*` calls, shared with the service worker via
  `importScripts` and unit-tested in `bookmarks-bar.test.js` (`npm test`)

**Top-Level Folder Management** (`getOrCreateTopLevelFolder()` in background.js):
- Within the resolved Bookmarks Bar, searches for existing 'tab-bankruptcy' folder
- Creates at index 0 if new
- Moves to index 0 if exists but not first
- Returns folder for use as parent

**URL Validation** (`isValidUrl()` in background.js:159-173):
- Filters out chrome://, chrome-extension://, edge://, about:, data:, file://
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
- `identity`: Read the current profile's account email (via
  `chrome.identity.getProfileUserInfo`) to show which profile a run affects

## Common Issues

**Extension not loading**: Check manifest.json syntax, verify all referenced files exist
**Bookmarks not saving / "Could not find Bookmarks Bar"**: Both account-bookmarks
(signed-in) and local-only profiles are supported. The extension only errors when
no Bookmarks Bar can be resolved at all. Check console at `chrome://extensions/` →
extension details → service worker "inspect views"
**Tabs not closing**: Verify "Close tabs after saving" checkbox state, check browser console for errors
