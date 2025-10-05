// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'declareBankruptcy') {
    handleBankruptcy(request.closeTabs, request.currentWindowOnly)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
});

// Get or create the top-level 'tab-bankruptcy' folder
async function getOrCreateTopLevelFolder() {
  const bookmarkTree = await chrome.bookmarks.getTree();
  const bookmarksBar = bookmarkTree[0].children.find(
    child => child.id === '1' // Bookmarks Bar has id '1' in Chrome
  );

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

    // Count total tabs first
    let totalTabCount = 0;
    for (const window of windows) {
      const tabs = await chrome.tabs.query({ windowId: window.id });
      totalTabCount += tabs.filter(tab => isValidUrl(tab.url)).length;
    }

    // Get or create the top-level 'tab-bankruptcy' folder
    const topLevelFolder = await getOrCreateTopLevelFolder();

    // Create timestamped subfolder with counts
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const folderName = `${timestamp}-${windows.length}w-${totalTabCount}t`;

    // Create the timestamped bankruptcy folder
    const mainFolder = await chrome.bookmarks.create({
      parentId: topLevelFolder.id,
      title: folderName
    });

    let totalTabsSaved = 0;
    const tabsToClose = [];

    // Process each window
    for (let i = 0; i < windows.length; i++) {
      const window = windows[i];
      const tabs = await chrome.tabs.query({ windowId: window.id });

      // Skip if window has no tabs
      if (tabs.length === 0) continue;

      // Create folder for this window
      const windowFolder = await chrome.bookmarks.create({
        parentId: mainFolder.id,
        title: `Window ${i + 1}`
      });

      // Save each tab as a bookmark
      for (const tab of tabs) {
        // Skip invalid URLs (chrome://, edge://, etc.)
        if (!isValidUrl(tab.url)) {
          continue;
        }

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
      windowCount: windows.length,
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

// Check if URL is valid for bookmarking
function isValidUrl(url) {
  if (!url) return false;

  // Skip Chrome internal pages
  const invalidPrefixes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'data:',
    'file://'
  ];

  return !invalidPrefixes.some(prefix => url.startsWith(prefix));
}
