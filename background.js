// Shared pure helpers (also unit-tested in Node)
importScripts(
  'bookmarks-bar.js',
  'bankruptcy-plan.js',
  'url-validation.js',
  'domain-grouping.js',
  'tab-organization.js',
  'grouping-report.js',
  'grouping-operation.js',
  'window-focus.js'
);

const SINGLETON_TARGET_KEY = 'tabOrganization:singletonTargetWindowId:v2';

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove(SINGLETON_TARGET_KEY);
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'declareBankruptcy') {
    handleBankruptcy(request.closeTabs, request.currentWindowOnly)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }

  if (request.action === 'groupTabsByDomain') {
    handleGroupTabsByDomain(
      request.currentWindowOnly,
      request.currentWindowId,
      request.byGithubRepo
    )
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'combineSingleTabWindows') {
    handleCombineSingleTabWindows(request.mode)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'sortTabsInWindows') {
    handleSortTabsInWindows(request)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'focusReportWindow') {
    focusBrowserWindow(
      request.windowId,
      (windowId, updateInfo) => chrome.windows.update(windowId, updateInfo)
    )
      .then(result => sendResponse(result))
      .catch(error => sendResponse({
        success: false,
        error: `Could not focus window: ${error.message}`
      }));
    return true;
  }
});

// Deduplicate exact HTTP(S) URLs, consolidate every eligible hostname into a
// dedicated window, then open a one-shot before/after audit report.
async function handleGroupTabsByDomain(currentWindowOnly, currentWindowId, byGithubRepo) {
  try {
    return await executeDomainGrouping(
      { currentWindowOnly, currentWindowId, byGithubRepo },
      {
        planDomainGrouping,
        buildGroupingReport,
        captureNormalWindows,
        removeTabs: tabIds => chrome.tabs.remove(tabIds),
        createGroupedWindow: async (tabId, domain) => {
          const groupedWindow = await chrome.windows.create({
            tabId,
            focused: false,
            type: 'normal'
          });
          if (!groupedWindow || groupedWindow.id === undefined) {
            throw new Error(`Could not create grouped window for ${domain}`);
          }
          return groupedWindow.id;
        },
        moveTab: (tabId, windowId) => chrome.tabs.move(tabId, { windowId, index: -1 }),
        saveReport: (key, report) => chrome.storage.local.set({ [key]: report }),
        openReport: reportId => chrome.tabs.create({
          url: chrome.runtime.getURL(`report.html?id=${encodeURIComponent(reportId)}`)
        }),
        discardReport: key => chrome.storage.local.remove(key),
        createReportId: () => crypto.randomUUID()
      }
    );
  } catch (error) {
    console.error('Domain grouping error:', error);
    return { success: false, error: error.message };
  }
}

async function handleCombineSingleTabWindows(mode) {
  try {
    return await executeSingletonCombination(mode, {
      captureNormalWindows,
      moveTab: (tabId, windowId) => chrome.tabs.move(tabId, { windowId, index: -1 }),
      createTargetWindow: async tabId => {
        const targetWindow = await chrome.windows.create({
          tabId,
          focused: false,
          type: 'normal'
        });
        if (!targetWindow || targetWindow.id === undefined) {
          throw new Error('Could not create singleton catch-all window');
        }
        return targetWindow.id;
      },
      getPreferredTargetWindowId: async () => {
        const stored = await chrome.storage.local.get(SINGLETON_TARGET_KEY);
        return stored[SINGLETON_TARGET_KEY] ?? null;
      },
      savePreferredTargetWindowId: windowId => chrome.storage.local.set({
        [SINGLETON_TARGET_KEY]: windowId
      })
    });
  } catch (error) {
    console.error('Single-tab window combination error:', error);
    return { success: false, error: error.message };
  }
}

async function handleSortTabsInWindows({ currentWindowOnly, currentWindowId, sortBy }) {
  try {
    return await executeWindowSort(
      { currentWindowOnly, currentWindowId, sortBy },
      {
        captureNormalWindows,
        moveTab: (tabId, windowId, index) => chrome.tabs.move(tabId, { windowId, index })
      }
    );
  } catch (error) {
    console.error('Window tab sorting error:', error);
    return { success: false, error: error.message };
  }
}

async function captureNormalWindows(domainByWindowId = new Map()) {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const snapshot = [];

  for (const [index, window] of windows.entries()) {
    const tabs = await chrome.tabs.query({ windowId: window.id });
    snapshot.push({
      windowNumber: index + 1,
      windowId: window.id,
      incognito: window.incognito === true,
      domain: domainByWindowId.get(window.id) || null,
      tabs: tabs.map(tab => ({
        id: tab.id,
        title: tab.title || tab.url || 'Untitled tab',
        url: tab.url || '',
        pinned: tab.pinned === true,
        groupId: Number.isInteger(tab.groupId) ? tab.groupId : -1
      }))
    });
  }

  return snapshot;
}

// Get or create the top-level 'tab-bankruptcy' folder
async function getOrCreateTopLevelFolder() {
  const bookmarkTree = await chrome.bookmarks.getTree();
  // Resolve the Bookmarks Bar robustly: works for account (synced) bookmarks,
  // local (device) bookmarks, or both — preferring the synced bar. Falls back
  // to the legacy id '1' node on older Chrome. See bookmarks-bar.js.
  const bookmarksBar = resolveBookmarksBar(bookmarkTree);

  if (!bookmarksBar) {
    throw new Error('Could not find Bookmarks Bar');
  }

  // Look for existing 'tab-bankruptcy' folder
  let topLevelFolder = bookmarksBar.children.find(
    child => child.title === 'tab-bankruptcy' && !child.url
  );

  // Create if it doesn't exist
  if (!topLevelFolder) {
    topLevelFolder = await chrome.bookmarks.create({
      parentId: bookmarksBar.id,
      title: 'tab-bankruptcy',
      index: 0  // Position as first item in Bookmarks Bar
    });
  } else {
    // If it exists but isn't first, move it to the first position
    if (topLevelFolder.index !== 0) {
      await chrome.bookmarks.move(topLevelFolder.id, {
        parentId: bookmarksBar.id,
        index: 0
      });
    }
  }

  return topLevelFolder;
}

// Main bankruptcy handler
async function handleBankruptcy(closeTabs, currentWindowOnly) {
  try {
    // Get all windows (or just current window)
    let windows;
    if (currentWindowOnly) {
      const currentWindow = await chrome.windows.getCurrent({ populate: true });
      windows = [currentWindow];
    } else {
      windows = await chrome.windows.getAll({ populate: true });
    }

    // Gather each window's tabs, then plan which windows to save. Windows with
    // no bookmarkable tabs are dropped so no empty "Window N" folder is created;
    // survivors are renumbered sequentially. (planBankruptcyWindows is pure.)
    const windowTabLists = [];
    for (const window of windows) {
      windowTabLists.push(await chrome.tabs.query({ windowId: window.id }));
    }
    const plannedWindows = planBankruptcyWindows(windowTabLists, isValidUrl);

    const totalTabCount = plannedWindows.reduce((n, w) => n + w.tabs.length, 0);

    // Nothing bookmarkable in scope: don't create an empty timestamped folder
    // and don't close anything.
    if (plannedWindows.length === 0) {
      return {
        success: false,
        error: 'No bookmarkable tabs found (chrome:// and similar pages are skipped).'
      };
    }

    // Get or create the top-level 'tab-bankruptcy' folder
    const topLevelFolder = await getOrCreateTopLevelFolder();

    // Create timestamped subfolder; counts reflect windows/tabs actually saved
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const folderName = `${timestamp}-${plannedWindows.length}w-${totalTabCount}t`;

    // Create the timestamped bankruptcy folder
    const mainFolder = await chrome.bookmarks.create({
      parentId: topLevelFolder.id,
      title: folderName
    });

    let totalTabsSaved = 0;
    const tabsToClose = [];

    // Process each planned (non-empty) window
    for (const plannedWindow of plannedWindows) {
      // Create folder for this window (sequentially numbered by the planner)
      const windowFolder = await chrome.bookmarks.create({
        parentId: mainFolder.id,
        title: `Window ${plannedWindow.windowNumber}`
      });

      // Save each valid tab as a bookmark
      for (const tab of plannedWindow.tabs) {
        try {
          await chrome.bookmarks.create({
            parentId: windowFolder.id,
            title: tab.title || tab.url,
            url: tab.url
          });

          totalTabsSaved++;

          // Add to close list if requested
          if (closeTabs) {
            tabsToClose.push(tab.id);
          }
        } catch (error) {
          console.error(`Failed to bookmark tab: ${tab.url}`, error);
          // Continue with other tabs even if one fails
        }
      }
    }

    // Close tabs if requested (do this after all bookmarks are created)
    if (closeTabs && tabsToClose.length > 0) {
      // Keep at least one tab open per window to prevent closing the browser
      const currentWindow = await chrome.windows.getCurrent({ populate: true });
      const currentWindowTabs = await chrome.tabs.query({ windowId: currentWindow.id });

      // If we're closing all tabs in current window, keep one new tab
      const currentWindowTabIds = currentWindowTabs.map(t => t.id);
      const closingAllCurrentWindowTabs = currentWindowTabIds.every(id => tabsToClose.includes(id));

      if (closingAllCurrentWindowTabs) {
        // Create a new tab first
        await chrome.tabs.create({ url: 'chrome://newtab' });
      }

      // Close the tabs
      await chrome.tabs.remove(tabsToClose);
    }

    return {
      success: true,
      tabCount: totalTabsSaved,
      windowCount: plannedWindows.length,
      folderName: folderName
    };

  } catch (error) {
    console.error('Bankruptcy error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
