function buildGroupingReport({ scope, beforeWindows, afterWindows, groups, duplicates }) {
  const duplicateCount = (duplicates || []).reduce(
    (count, duplicate) => count + duplicate.removed.length,
    0
  );
  const groupedTabCount = (groups || []).reduce((count, group) => count + group.tabs.length, 0);

  return {
    createdAt: new Date().toISOString(),
    scope,
    summary: {
      beforeWindowCount: (beforeWindows || []).length,
      beforeTabCount: countTabs(beforeWindows),
      afterWindowCount: (afterWindows || []).length,
      afterTabCount: countTabs(afterWindows),
      domainCount: (groups || []).length,
      groupedTabCount,
      duplicateUrlCount: (duplicates || []).length,
      duplicateTabCount: duplicateCount
    },
    beforeWindows: beforeWindows || [],
    afterWindows: afterWindows || [],
    duplicates: duplicates || []
  };
}

function countTabs(windows) {
  return (windows || []).reduce(
    (count, window) => count + (window && window.tabs ? window.tabs.length : 0),
    0
  );
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildGroupingReport, countTabs };
}
