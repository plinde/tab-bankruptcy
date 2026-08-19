// Execute a domain-separation run through injected browser operations. Keeping
// orchestration here makes mutation order and report lifecycle testable without
// a live Chrome profile.
async function executeDomainGrouping(options, dependencies) {
  const {
    planDomainGrouping,
    buildGroupingReport,
    captureNormalWindows,
    removeTabs,
    createGroupedWindow,
    moveTab,
    saveReport,
    openReport,
    discardReport,
    createReportId
  } = dependencies;

  const beforeWindows = await captureNormalWindows();
  const scopedWindows = options.currentWindowOnly
    ? beforeWindows.filter(window =>
      !window.incognito && window.windowId === options.currentWindowId
    )
    : beforeWindows.filter(window => !window.incognito);
  const plan = planDomainGrouping(scopedWindows, {
    byGithubRepo: options.byGithubRepo === true
  });

  if (plan.groups.length === 0) {
    return { success: false, error: 'No groupable HTTP(S) tabs found.' };
  }

  const duplicateTabIds = plan.duplicates.flatMap(duplicate =>
    duplicate.removed.map(occurrence => occurrence.tab.id)
  );
  if (duplicateTabIds.length > 0) {
    await removeTabs(duplicateTabIds);
  }

  const domainByWindowId = new Map();
  for (const group of plan.groups) {
    const [firstTab, ...remainingTabs] = group.tabs;
    const groupedWindowId = await createGroupedWindow(firstTab.id, group.domain);
    domainByWindowId.set(groupedWindowId, group.domain);

    for (const tab of remainingTabs) {
      await moveTab(tab.id, groupedWindowId);
    }
  }

  const afterWindows = await captureNormalWindows(domainByWindowId);
  const report = buildGroupingReport({
    scope: options.currentWindowOnly ? 'current-window' : 'all-windows',
    beforeWindows,
    afterWindows,
    groups: plan.groups,
    duplicates: plan.duplicates
  });
  const reportId = createReportId();
  const reportKey = `groupingReport:${reportId}`;
  await saveReport(reportKey, report);

  try {
    await openReport(reportId);
  } catch (error) {
    await discardReport(reportKey);
    throw error;
  }

  return {
    success: true,
    domainCount: report.summary.domainCount,
    tabCount: report.summary.groupedTabCount,
    duplicateCount: report.summary.duplicateTabCount
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { executeDomainGrouping };
}
