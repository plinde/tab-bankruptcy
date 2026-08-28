// Plan and execute "consolidate all tabs/windows": collect every tab across the
// profile's normal windows, drop exact-URL duplicates, and gather the survivors
// into a single new window. Emptied source windows close on their own once their
// last tab is moved out, so the previous windows disappear.

// Pure planner (no chrome.*), unit-tested in tab-consolidation.test.js.
//
// `windows` is an ordered snapshot of { windowId, incognito, tabs }. Tabs are
// walked in window then tab order; the first occurrence of a normalized URL is
// kept and each later occurrence is recorded for removal. Tabs whose URL cannot
// be normalized (blank or malformed) are always kept and never deduplicated.
function planTabConsolidation(windows) {
  const keptTabs = [];
  const duplicateTabIds = [];
  const firstByUrl = new Map();
  const sourceWindowIds = new Set();

  for (const window of windows || []) {
    if (!window || !Array.isArray(window.tabs)) continue;

    for (const tab of window.tabs) {
      if (!tab) continue;
      sourceWindowIds.add(window.windowId);

      const normalizedUrl = normalizeUrl(tab.url);
      if (normalizedUrl !== null && firstByUrl.has(normalizedUrl)) {
        duplicateTabIds.push(tab.id);
        continue;
      }

      if (normalizedUrl !== null) {
        firstByUrl.set(normalizedUrl, tab.id);
      }
      keptTabs.push({ id: tab.id, title: tab.title || tab.url || 'Untitled tab', url: tab.url || '' });
    }
  }

  const sourceWindowCount = sourceWindowIds.size;
  // Nothing to do when everything already lives in one window with no duplicates.
  const needsWork = duplicateTabIds.length > 0 || sourceWindowCount > 1;

  return { keptTabs, duplicateTabIds, sourceWindowCount, needsWork };
}

function normalizeUrl(url) {
  if (typeof url !== 'string' || url === '') return null;
  try {
    return new URL(url).href;
  } catch (error) {
    return null;
  }
}

// Orchestrate the consolidation through injected browser operations so mutation
// order stays testable without a live Chrome profile. Incognito windows are left
// untouched to avoid invalid regular/incognito tab moves.
async function executeTabConsolidation(dependencies) {
  const windows = (await dependencies.captureNormalWindows()).filter(window => !window.incognito);
  const plan = planTabConsolidation(windows);

  if (!plan.needsWork) {
    return {
      success: true,
      tabCount: 0,
      windowCount: 0,
      duplicateCount: 0,
      consolidated: false,
      targetWindowId: null
    };
  }

  if (plan.duplicateTabIds.length > 0) {
    await dependencies.removeTabs(plan.duplicateTabIds);
  }

  const [firstTab, ...remainingTabs] = plan.keptTabs;
  const targetWindowId = await dependencies.createTargetWindow(firstTab.id);
  for (const tab of remainingTabs) {
    await dependencies.moveTab(tab.id, targetWindowId);
  }

  return {
    success: true,
    tabCount: plan.keptTabs.length,
    windowCount: plan.sourceWindowCount,
    duplicateCount: plan.duplicateTabIds.length,
    consolidated: true,
    targetWindowId
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { planTabConsolidation, executeTabConsolidation, normalizeUrl };
}
