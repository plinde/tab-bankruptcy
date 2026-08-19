if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', loadReport);
}

async function loadReport() {
  const reportId = new URLSearchParams(location.search).get('id');
  if (!reportId) {
    showError('Missing report identifier. This temporary report cannot be loaded.');
    return;
  }

  const reportKey = `groupingReport:${reportId}`;
  try {
    const stored = await chrome.storage.local.get(reportKey);
    const report = stored[reportKey];
    if (!report) {
      showError('This temporary report has expired or was already opened.');
      return;
    }

    await chrome.storage.local.remove(reportKey);
    renderReport(report);
  } catch (error) {
    showError(`Could not load report: ${error.message}`);
  }
}

function renderReport(report) {
  const scope = report.scope === 'current-window' ? 'current window' : 'all windows';
  document.getElementById('reportMeta').textContent =
    `${new Date(report.createdAt).toLocaleString()} · Scope: ${scope}`;

  renderSummary(report.summary || {});
  renderDuplicates(report.duplicates || []);
  renderWindows('beforeWindows', report.beforeWindows || []);
  renderWindows('afterWindows', report.afterWindows || []);
  document.getElementById('reportContent').hidden = false;
}

function renderSummary(summary) {
  const values = [
    ['Groups separated', summary.domainCount || 0],
    ['Tabs grouped', summary.groupedTabCount || 0],
    ['Duplicate URLs', summary.duplicateUrlCount || 0],
    ['Duplicate tabs removed', summary.duplicateTabCount || 0],
    ['Before', `${summary.beforeWindowCount || 0} windows / ${summary.beforeTabCount || 0} tabs`],
    ['After', `${summary.afterWindowCount || 0} windows / ${summary.afterTabCount || 0} tabs`],
  ];
  const container = document.getElementById('summary');

  for (const [label, value] of values) {
    const card = element('div', 'summary-card');
    card.append(element('strong', null, String(value)), element('span', null, label));
    container.append(card);
  }
}

function renderDuplicates(duplicates) {
  const container = document.getElementById('duplicates');
  if (duplicates.length === 0) {
    container.append(element('p', 'empty', 'No exact duplicate URLs found.'));
    return;
  }

  for (const duplicate of duplicates) {
    const card = element('article', 'duplicate-card');
    card.append(element('h3', null, duplicate.url));
    card.append(renderOccurrence('Kept', duplicate.kept));
    for (const occurrence of duplicate.removed || []) {
      card.append(renderOccurrence('Removed', occurrence));
    }
    container.append(card);
  }
}

function renderOccurrence(action, occurrence) {
  const row = element('div', 'occurrence');
  row.append(
    element('strong', null, `${action} · Original Window ${occurrence.windowNumber}`),
    element('span', null, occurrence.tab.title || 'Untitled tab'),
    linkOrText(occurrence.tab.url)
  );
  return row;
}

function renderWindows(containerId, windows) {
  const container = document.getElementById(containerId);
  if (windows.length === 0) {
    container.append(element('p', 'empty', 'No normal browser windows.'));
    return;
  }

  for (const window of windows) {
    const card = element('article', 'window-card');
    const suffix = window.domain ? ` · Domain: ${window.domain}` : '';
    const header = element('div', 'window-header');
    header.append(
      element('h3', null, `Window ${window.windowNumber}${suffix}`),
      createFocusButton(window.windowId, window.windowNumber)
    );
    card.append(header);
    const list = element('ol', 'tab-list');
    for (const tab of window.tabs || []) {
      const item = element('li');
      item.append(element('strong', null, tab.title || 'Untitled tab'), linkOrText(tab.url));
      list.append(item);
    }
    card.append(list);
    container.append(card);
  }
}

function createFocusButton(windowId, windowNumber) {
  const button = element('button', 'focus-window-button', 'Focus window');
  button.type = 'button';
  button.addEventListener('click', () => focusWindow(windowId, windowNumber, button));
  return button;
}

async function focusWindow(windowId, windowNumber, button) {
  const status = document.getElementById('reportStatus');
  button.disabled = true;
  status.className = 'report-status';
  status.textContent = `Focusing Window ${windowNumber}…`;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'focusReportWindow',
      windowId
    });
    if (!response || !response.success) {
      throw new Error(response && response.error ? response.error : 'Unknown extension error.');
    }
    status.textContent = `Focused Window ${windowNumber}.`;
  } catch (error) {
    status.className = 'report-status error-text';
    status.textContent =
      `Window ${windowNumber} is unavailable. It may have closed during grouping. ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

function linkOrText(url) {
  if (!url) return element('span', 'url', '(URL unavailable)');
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    return element('span', 'url', url);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return element('span', 'url', url);
  }
  const link = element('a', 'url', url);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noreferrer';
  return link;
}

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showError(message) {
  document.getElementById('reportMeta').hidden = true;
  const error = document.getElementById('reportError');
  error.textContent = message;
  error.hidden = false;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderReport,
    renderSummary,
    renderDuplicates,
    renderWindows,
    focusWindow
  };
}
