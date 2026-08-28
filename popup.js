// Initialize popup with current tab/window counts
async function updateStats() {
  const currentWindowOnly = document.getElementById('currentWindowOnly').checked;

  try {
    let windows;
    if (currentWindowOnly) {
      const currentWindow = await chrome.windows.getCurrent();
      windows = [currentWindow];
    } else {
      windows = await chrome.windows.getAll({ populate: true });
    }

    let totalTabs = 0;
    for (const window of windows) {
      const tabs = await chrome.tabs.query({ windowId: window.id });
      totalTabs += tabs.length;
    }

    document.getElementById('windowCount').textContent = windows.length;
    document.getElementById('tabCount').textContent = totalTabs;
  } catch (error) {
    console.error('Error updating stats:', error);
    document.getElementById('windowCount').textContent = '?';
    document.getElementById('tabCount').textContent = '?';
  }
}

// Show status message
function showStatus(message, isError = false) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + (isError ? 'error' : 'success');
  statusDiv.style.display = 'block';
}

function setActionButtonsDisabled(disabled) {
  for (const id of ['bankruptButton', 'groupButton', 'combineButton', 'consolidateButton', 'sortButton']) {
    document.getElementById(id).disabled = disabled;
  }
}

// Handle bankruptcy button click
document.getElementById('bankruptButton').addEventListener('click', async () => {
  const button = document.getElementById('bankruptButton');
  const closeTabs = document.getElementById('closeTabs').checked;
  const currentWindowOnly = document.getElementById('currentWindowOnly').checked;

  // Disable button to prevent multiple clicks
  setActionButtonsDisabled(true);
  button.textContent = 'Processing...';

  try {
    // Send message to background script to handle the bankruptcy
    const response = await chrome.runtime.sendMessage({
      action: 'declareBankruptcy',
      closeTabs: closeTabs,
      currentWindowOnly: currentWindowOnly
    });

    if (response.success) {
      showStatus(`Successfully saved ${response.tabCount} tabs across ${response.windowCount} windows!`);

      // Update stats after a short delay
      setTimeout(() => {
        updateStats();
        setActionButtonsDisabled(false);
        button.textContent = 'Declare Bankruptcy';
      }, 1000);
    } else {
      showStatus(`Error: ${response.error}`, true);
      setActionButtonsDisabled(false);
      button.textContent = 'Declare Bankruptcy';
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, true);
    setActionButtonsDisabled(false);
    button.textContent = 'Declare Bankruptcy';
  }
});

// Group HTTP(S) destinations into dedicated windows for manual review.
document.getElementById('groupButton').addEventListener('click', async () => {
  const button = document.getElementById('groupButton');
  const currentWindowOnly = document.getElementById('currentWindowOnly').checked;
  const byGithubRepo = document.getElementById('byGithubRepo').checked;

  setActionButtonsDisabled(true);
  button.textContent = 'Grouping...';

  try {
    const currentWindow = currentWindowOnly ? await chrome.windows.getCurrent() : null;
    const response = await chrome.runtime.sendMessage({
      action: 'groupTabsByDomain',
      currentWindowOnly: currentWindowOnly,
      currentWindowId: currentWindow ? currentWindow.id : null,
      byGithubRepo: byGithubRepo
    });

    if (response.success) {
      showStatus(
        `Separated ${response.tabCount} tabs into ${response.domainCount} group windows; ` +
        `removed ${response.duplicateCount} duplicates. Report opened.`
      );
      setTimeout(updateStats, 1000);
    } else {
      showStatus(`Error: ${response.error}`, true);
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, true);
  } finally {
    setActionButtonsDisabled(false);
    button.textContent = 'Group Tabs by Domain';
  }
});

document.getElementById('combineButton').addEventListener('click', async () => {
  const button = document.getElementById('combineButton');
  const mode = document.getElementById('combineMode').value;
  setActionButtonsDisabled(true);
  button.textContent = 'Combining...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'combineSingleTabWindows',
      mode
    });
    if (response.success) {
      const message = response.windowCount === 0
        ? 'No matching single-tab windows needed combining.'
        : `Combined ${response.tabCount} tabs from ${response.windowCount} windows.`;
      showStatus(message);
      setTimeout(updateStats, 1000);
    } else {
      showStatus(`Error: ${response.error}`, true);
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, true);
  } finally {
    setActionButtonsDisabled(false);
    button.textContent = 'Combine Windows';
  }
});

document.getElementById('consolidateButton').addEventListener('click', async () => {
  const button = document.getElementById('consolidateButton');
  setActionButtonsDisabled(true);
  button.textContent = 'Consolidating...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'consolidateAllTabs'
    });
    if (response.success) {
      const message = response.consolidated
        ? `Consolidated ${response.tabCount} tabs from ${response.windowCount} windows into one; ` +
          `removed ${response.duplicateCount} duplicates.`
        : 'Nothing to consolidate — tabs already live in a single window.';
      showStatus(message);
      setTimeout(updateStats, 1000);
    } else {
      showStatus(`Error: ${response.error}`, true);
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, true);
  } finally {
    setActionButtonsDisabled(false);
    button.textContent = 'Consolidate All Tabs/Windows';
  }
});

document.getElementById('sortButton').addEventListener('click', async () => {
  const button = document.getElementById('sortButton');
  const currentWindowOnly = document.getElementById('currentWindowOnly').checked;
  const sortBy = document.getElementById('sortBy').value;
  setActionButtonsDisabled(true);
  button.textContent = 'Sorting...';

  try {
    const currentWindow = currentWindowOnly ? await chrome.windows.getCurrent() : null;
    const response = await chrome.runtime.sendMessage({
      action: 'sortTabsInWindows',
      currentWindowOnly,
      currentWindowId: currentWindow ? currentWindow.id : null,
      sortBy
    });
    if (response.success) {
      showStatus(
        `Sorted ${response.tabCount} tabs across ${response.windowCount} changed windows.`
      );
    } else {
      showStatus(`Error: ${response.error}`, true);
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, true);
  } finally {
    setActionButtonsDisabled(false);
    button.textContent = 'Sort Existing Windows';
  }
});

// Show which profile this run affects. Runs independently of updateStats() so a
// slow or denied identity lookup never blocks the tab/window counts. Degrades
// to the not-signed-in text on any failure (see profile-disclosure.js).
function updateProfileDisclosure() {
  const el = document.getElementById('profileIdentity');

  const render = (userInfo) => {
    el.textContent = formatProfileDisclosure(userInfo);
  };

  try {
    // accountStatus: 'ANY' returns an email even when signed in but not syncing.
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' })
      .then(render)
      .catch(() => render(null));
  } catch (error) {
    // Older Chrome may not accept the details argument or expose the API.
    try {
      chrome.identity.getProfileUserInfo(render);
    } catch (fallbackError) {
      render(null);
    }
  }
}

// Update stats when window selection changes
document.getElementById('currentWindowOnly').addEventListener('change', updateStats);

// Initialize stats and profile disclosure on popup open (independently)
document.addEventListener('DOMContentLoaded', () => {
  updateStats();
  updateProfileDisclosure();
});
