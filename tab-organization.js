// Plan and execute tab organization that does not create new browser windows.

function planSingletonCombination(windows, mode = 'all', preferredTargetWindowId = null) {
  const candidates = (windows || []).filter(window =>
    window && Array.isArray(window.tabs) && window.tabs.length === 1
  );

  if (mode === 'github') {
    const preferredTarget = (windows || []).find(window =>
      window && window.windowId === preferredTargetWindowId &&
      Array.isArray(window.tabs) && window.tabs.length > 0
    );
    const generalGithubTarget = largestWindow((windows || []).filter(window =>
      isDedicatedWindow(window, isGeneralGithubTab)
    ));
    const dedicatedGithubTarget = largestWindow((windows || []).filter(window =>
      isDedicatedWindow(window, isGithubTab)
    ));
    const target = preferredTarget || generalGithubTarget || dedicatedGithubTarget;
    if (!target && candidates.length > 0) {
      const [firstCandidate, ...remainingCandidates] = candidates;
      return {
        targetWindowId: null,
        createTargetTabId: firstCandidate.tabs[0].id,
        moves: remainingCandidates.map(window => ({
          tabId: window.tabs[0].id,
          sourceWindowId: window.windowId
        }))
      };
    }
    const sources = candidates.filter(window => window !== target);
    return buildCombinationPlan(target, sources);
  }

  const [target, ...sources] = candidates;
  return buildCombinationPlan(target, sources);
}

function isDedicatedWindow(window, matchesTab) {
  return window && Array.isArray(window.tabs) && window.tabs.length > 0 &&
    window.tabs.every(matchesTab);
}

function largestWindow(windows) {
  return windows.reduce((largest, window) =>
    !largest || window.tabs.length > largest.tabs.length ? window : largest
  , null);
}

function buildCombinationPlan(target, sources) {
  if (!target || !sources || sources.length === 0) {
    return { targetWindowId: null, moves: [] };
  }

  return {
    targetWindowId: target.windowId,
    moves: sources.map(window => ({
      tabId: window.tabs[0].id,
      sourceWindowId: window.windowId
    }))
  };
}

function isGeneralGithubTab(tab) {
  const parsed = parseHttpUrl(tab && tab.url);
  return parsed !== null && parsed.hostname.toLowerCase() === 'github.com' &&
    parsed.pathname.split('/').filter(Boolean).length < 2;
}

function isGithubTab(tab) {
  const parsed = parseHttpUrl(tab && tab.url);
  return parsed !== null && parsed.hostname.toLowerCase() === 'github.com';
}

function parseHttpUrl(url) {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch (error) {
    return null;
  }
}

async function executeSingletonCombination(mode, dependencies) {
  const windows = await dependencies.captureNormalWindows();
  const preferredTargetWindowId = mode === 'github' && dependencies.getPreferredTargetWindowId
    ? await dependencies.getPreferredTargetWindowId()
    : null;
  const plan = planSingletonCombination(windows, mode, preferredTargetWindowId);
  let targetWindowId = plan.targetWindowId;
  let createdTargetCount = 0;
  if (plan.createTargetTabId !== undefined) {
    targetWindowId = await dependencies.createTargetWindow(plan.createTargetTabId);
    createdTargetCount = 1;
  }
  for (const move of plan.moves) {
    await dependencies.moveTab(move.tabId, targetWindowId);
  }

  if (plan.moves.length === 0 && createdTargetCount === 0) {
    return {
      success: true,
      tabCount: 0,
      windowCount: 0,
      targetWindowId: null
    };
  }

  if (mode === 'github' && dependencies.savePreferredTargetWindowId) {
    await dependencies.savePreferredTargetWindowId(targetWindowId);
  }

  return {
    success: true,
    tabCount: plan.moves.length + createdTargetCount,
    windowCount: plan.moves.length + createdTargetCount,
    targetWindowId
  };
}

function planWindowSort(windows, sortBy = 'title') {
  return (windows || []).filter(Boolean).map(window => {
    const tabs = (window.tabs || []).map((tab, index) => ({ ...tab, originalIndex: index }));
    const compare = compareTabs(sortBy);
    const tabIds = contiguousTabSections(tabs)
      .flatMap(section => section.sort(compare))
      .map(tab => tab.id);
    const changed = tabIds.some((tabId, index) => tabId !== tabs[index].id);
    return { windowId: window.windowId, tabIds, changed };
  });
}

// Chrome keeps pinned tabs and each tab group contiguous. Sort inside those
// boundaries so ordering never regroups tabs or asks Chrome for an invalid move.
function contiguousTabSections(tabs) {
  const sections = [];
  for (const tab of tabs) {
    const groupId = Number.isInteger(tab.groupId) ? tab.groupId : -1;
    const key = tab.pinned ? 'pinned' : `group:${groupId}`;
    const previous = sections.at(-1);
    if (!previous || previous.key !== key) {
      sections.push({ key, tabs: [] });
    }
    sections.at(-1).tabs.push(tab);
  }
  return sections.map(section => section.tabs);
}

function compareTabs(sortBy) {
  return (left, right) => {
    const leftValue = sortValue(left, sortBy);
    const rightValue = sortValue(right, sortBy);
    const comparison = compareSortValues(leftValue, rightValue);
    if (comparison) return comparison;
    if (sortBy === 'url-title') {
      const titleComparison = compareSortValues(sortValue(left, 'title'), sortValue(right, 'title'));
      if (titleComparison) return titleComparison;
    }
    return comparison || left.originalIndex - right.originalIndex;
  };
}

function compareSortValues(left, right) {
  return left.localeCompare(right, undefined, {
    sensitivity: 'base',
    numeric: true
  });
}

function sortValue(tab, sortBy) {
  if (sortBy === 'url' || sortBy === 'url-title') return tab.url || '';
  return tab.title || tab.url || '';
}

async function executeWindowSort(options, dependencies) {
  const windows = await dependencies.captureNormalWindows();
  const scopedWindows = options.currentWindowOnly
    ? windows.filter(window => window.windowId === options.currentWindowId)
    : windows;
  const plans = planWindowSort(scopedWindows, options.sortBy).filter(plan => plan.changed);

  for (const plan of plans) {
    for (const [index, tabId] of plan.tabIds.entries()) {
      await dependencies.moveTab(tabId, plan.windowId, index);
    }
  }

  return {
    success: true,
    windowCount: plans.length,
    tabCount: plans.reduce((count, plan) => count + plan.tabIds.length, 0)
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    planSingletonCombination,
    executeSingletonCombination,
    planWindowSort,
    executeWindowSort,
    isGeneralGithubTab
  };
}
