const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildGroupingReport, countTabs } = require('./grouping-report.js');

test('builds before/after and duplicate summary counts', () => {
  const beforeWindows = [
    { windowNumber: 1, tabs: [{ id: 1 }, { id: 2 }] },
    { windowNumber: 2, tabs: [{ id: 3 }] },
  ];
  const afterWindows = [
    { windowNumber: 1, tabs: [{ id: 1 }] },
    { windowNumber: 2, domain: 'example.com', tabs: [{ id: 3 }] },
  ];
  const groups = [{ domain: 'example.com', tabs: [{ id: 3 }] }];
  const duplicates = [{
    url: 'https://example.com/',
    kept: { windowNumber: 2, tab: { id: 3 } },
    removed: [{ windowNumber: 1, tab: { id: 2 } }],
  }];

  const report = buildGroupingReport({
    scope: 'all-windows',
    beforeWindows,
    afterWindows,
    groups,
    duplicates,
  });

  assert.equal(report.scope, 'all-windows');
  assert.deepEqual(report.summary, {
    beforeWindowCount: 2,
    beforeTabCount: 3,
    afterWindowCount: 2,
    afterTabCount: 2,
    domainCount: 1,
    groupedTabCount: 1,
    duplicateUrlCount: 1,
    duplicateTabCount: 1,
  });
  assert.equal(report.beforeWindows, beforeWindows);
  assert.equal(report.afterWindows, afterWindows);
  assert.match(report.createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('countTabs and empty reports are defensive', () => {
  assert.equal(countTabs(), 0);
  assert.equal(countTabs([null, { tabs: null }, { tabs: [{}, {}] }]), 2);

  const report = buildGroupingReport({ scope: 'current-window' });
  assert.equal(report.summary.beforeTabCount, 0);
  assert.equal(report.summary.duplicateTabCount, 0);
  assert.deepEqual(report.duplicates, []);
});
