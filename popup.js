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

// Handle bankruptcy button click
document.getElementById('bankruptButton').addEventListener('click', async () => {
  const button = document.getElementById('bankruptButton');
  const closeTabs = document.getElementById('closeTabs').checked;
  const currentWindowOnly = document.getElementById('currentWindowOnly').checked;

  // Disable button to prevent multiple clicks
  button.disabled = true;
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
        button.disabled = false;
        button.textContent = 'Declare Bankruptcy';
      }, 1000);
    } else {
      showStatus(`Error: ${response.error}`, true);
      button.disabled = false;
      button.textContent = 'Declare Bankruptcy';
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, true);
    button.disabled = false;
    button.textContent = 'Declare Bankruptcy';
  }
});

// Update stats when window selection changes
document.getElementById('currentWindowOnly').addEventListener('change', updateStats);

// Initialize stats on popup open
document.addEventListener('DOMContentLoaded', updateStats);
