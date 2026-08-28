# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) that saves all open browser tabs to organized bookmarks, allowing users to "declare tab bankruptcy," or separates every eligible domain into its own window with exact-URL deduplication and a temporary audit report.

## Installation & Testing

Load extension in Chrome:
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this directory

After code changes, click the reload icon on the extension card at `chrome://extensions/`

Run the unit tests (pure logic, no browser required) with:

```bash
npm test   # node --test — covers bookmarks-bar, profile-disclosure, bankruptcy-plan, domain-grouping
```

Run the complete local gate with `npm run validate`.

## GitHub Test Fixtures

Any GitHub repository fixture, example URL, grouping key, or documentation
placeholder must use one of these GitHub-documented examples:

- `github.com/octo-org/octo-repo`
- `github.com/monalisa/octo-repo`

Do not use real users, organizations, or repositories in fixtures or examples.

## Versioning workflow

Every merged change increments `manifest.json` and `package.json` together.
Use exactly one SemVer step from the base branch:

- **Major** (`X+1.0.0`): breaking behavior or compatibility change
- **Minor** (`X.Y+1.0`): backward-compatible feature
- **Patch** (`X.Y.Z+1`): fix, docs, maintenance, or small tweak

Do not defer the source version bump to a later release change. Pull-request CI
runs `scripts/check-version.sh --base <base-sha>` and rejects unchanged,
mismatched, malformed, skipped, or multi-component version changes. Tags,
packaging, and publishing remain separate explicit release operations.

## Architecture

**Message Passing Pattern**:
- `popup.js` (UI) sends messages to `background.js` (service worker) via `chrome.runtime.sendMessage()`
- `background.js` handles all bookmark/tab operations asynchronously
- Results passed back to popup for user feedback

**Domain Separation Flow**:
1. User clicks "Group Tabs by Domain" in popup
2. Popup resolves its current window and sends
   `{action: 'groupTabsByDomain', currentWindowOnly, currentWindowId,
   byGithubRepo}`
3. Background snapshots every normal window; mutation scope is all windows or
   the invoking current window
4. `planDomainGrouping()` groups HTTP(S) tabs by exact lowercase hostname, all
   `file://` tabs under one key, and all `chrome://` tabs under another. When
   `byGithubRepo` is enabled, `github.com` is specialized into lowercase
   owner/repository groups when two path segments exist. Groups with only one tab
   are included; normalized exact-URL duplicates keep their first occurrence and
   record every later occurrence
5. `executeDomainGrouping()` in `grouping-operation.js` orchestrates injected,
   testable browser operations: remove later duplicates, create one unfocused
   normal window per grouping key, and move kept tabs there in discovery order
6. Background snapshots every normal window again, stores a one-shot report in
   `chrome.storage.local`, and opens `report.html`; the page consumes the data
7. No bookmarks are created. Malformed and unsupported-scheme tabs remain in
   their original windows

**Domain Grouping Planner** (`planDomainGrouping()` in `domain-grouping.js`):
- Pure function (no `chrome.*`) shared with the service worker via `importScripts`
  and unit-tested in `domain-grouping.test.js`
- Exact-hostname grouping: every hostname becomes a window, even a singleton;
  subdomains remain separate; HTTP/HTTPS, path, query, and fragment differences
  do not split a hostname group
- Prefix grouping: all `file://` tabs share one group and all `chrome://` tabs
  share another, regardless of path or internal page
- Optional GitHub repository specialization: when selected, `github.com` URLs
  with at least two path segments group by lowercase
  `github.com/<owner>/<repository>`; otherwise every GitHub URL stays in the
  general `github.com` group
- Exact-URL deduplication uses normalized `new URL(url).href`; first occurrence
  wins, while query/fragment differences remain distinct
- Preserves first-seen hostname order, tab discovery order, and original-window
  provenance for the report

**Grouping Report** (`grouping-report.js`, `report.html/js/css`):
- Shows full before/after normal-window snapshots with titles and URLs
- Lists every exact duplicate URL, the kept occurrence, and each removed copy's
  original window
- Uses DOM `textContent`/element creation for tab-controlled strings; never
  injects report content as HTML
- Data is stored under a random `groupingReport:<uuid>` key and removed after
  the report first loads
- Every before/after window card sends `focusReportWindow` with its snapshot
  `windowId`; the worker validates it via `focusBrowserWindow()` and calls
  `chrome.windows.update(id, { focused: true })`
- A source window emptied by grouping may already be closed; the report keeps
  working and shows an accessible unavailable-window error for that stale ID

**Grouping Operation Tests** (`grouping-operation.test.js`):
- Mock Chrome operations verify one window per singleton domain, dedupe-before-
  move ordering, current-window scope, before/after report lifecycle, no-op
  safety, mutation failure propagation, and cleanup after report-open failure

**Tab Organization** (`tab-organization.js`):
- Combines every one-tab window into the first singleton, or moves every
  singleton tab into a remembered target window. Initial target selection
  prefers a dedicated general GitHub window, then the largest dedicated GitHub
  window, and otherwise creates a dedicated catch-all window from the first
  singleton. Mixed-purpose windows are never selected heuristically. The target
  is remembered for subsequent runs
- Cross-window grouping and consolidation leave incognito windows untouched to
  avoid invalid regular/incognito tab moves; in-window sorting remains safe
- Sorts tabs by title, URL, or URL then title inside each existing window without
  moving tabs between windows; pinned tabs and tab groups remain in their
  existing sections
- Pure planners and injected browser operations are unit-tested in
  `tab-organization.test.js`

**Tab Consolidation** (`tab-consolidation.js`):
- "Consolidate all tabs/windows": popup sends `{action: 'consolidateAllTabs'}`;
  `handleConsolidateAllTabs()` runs `executeTabConsolidation()`
- `planTabConsolidation()` is a pure function (no `chrome.*`) that walks every
  normal, non-incognito window in window-then-tab order, keeps the first
  occurrence of each normalized `new URL(url).href`, and records every later
  exact-URL duplicate for removal. Blank or unparseable URLs are always kept and
  never deduplicated
- `executeTabConsolidation()` removes duplicate tabs, opens one new focused
  window from the first kept tab, and moves the remaining kept tabs into it in
  discovery order. Emptied source windows close on their own once their last tab
  moves out, so the previous windows disappear
- Incognito windows are left untouched to avoid invalid regular/incognito moves.
  The current-window option does not apply — consolidation always spans the whole
  profile
- No-op safety: when every tab already lives in a single window with no
  duplicates, it makes no changes and reports `consolidated: false`
- Pure planner and injected browser operations are unit-tested in
  `tab-consolidation.test.js`

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

**Bookmark URL Validation** (`isValidUrl()` in `url-validation.js`):
- Shared with the service worker via `importScripts`, with exact prefix behavior
  tested in `url-validation.test.js`
- Rejects missing, Chrome/Edge internal, `about:`, `data:`, and `file://` URLs

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

**URL Validation** (`isValidUrl()` in background.js):
- Filters out chrome://, chrome-extension://, edge://, about:, data:, file://
- Only valid URLs are counted and bookmarked

**Tab Closing Safety** (in `handleBankruptcy()`, background.js):
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
- `tabs` also permits moving grouped tabs into dedicated browser windows
- `storage`: Holds one-shot grouping report data until the report page opens
- `identity`: Read the current profile's account email (via
  `chrome.identity.getProfileUserInfo`) to show which profile a run affects

## Common Issues

**Extension not loading**: Check manifest.json syntax, verify all referenced files exist
**Bookmarks not saving / "Could not find Bookmarks Bar"**: Both account-bookmarks
(signed-in) and local-only profiles are supported. The extension only errors when
no Bookmarks Bar can be resolved at all. Check console at `chrome://extensions/` →
extension details → service worker "inspect views"
**Tabs not closing**: Verify "Close tabs after saving" checkbox state, check browser console for errors
