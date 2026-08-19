const { test } = require('node:test');
const assert = require('node:assert/strict');
const { executeDomainGrouping } = require('./grouping-operation.js');
const { planDomainGrouping } = require('./domain-grouping.js');
const { buildGroupingReport } = require('./grouping-report.js');

const tab = (id, url, title = url) => ({ id, url, title });
const window = (windowNumber, windowId, tabs) => ({ windowNumber, windowId, tabs });

function harness(beforeWindows, afterWindows = []) {
  const calls = [];
  let captureCount = 0;
  const dependencies = {
    planDomainGrouping,
    buildGroupingReport,
    async captureNormalWindows(domainByWindowId) {
      calls.push(['capture', domainByWindowId ? Array.from(domainByWindowId) : null]);
      captureCount += 1;
      return captureCount === 1 ? beforeWindows : afterWindows;
    },
    async removeTabs(ids) {
      calls.push(['remove', ids]);
    },
    async createGroupedWindow(tabId, domain) {
      const windowId = 900 + calls.filter(call => call[0] === 'create').length;
      calls.push(['create', tabId, domain, windowId]);
      return windowId;
    },
    async moveTab(tabId, windowId) {
      calls.push(['move', tabId, windowId]);
    },
    async saveReport(key, report) {
      calls.push(['save', key, report]);
    },
    async openReport(id) {
      calls.push(['open', id]);
    },
    async discardReport(key) {
      calls.push(['discard', key]);
    },
    createReportId() {
      return 'fixed-report-id';
    }
  };
  return { calls, dependencies };
}

test('separates every singleton domain into its own window and reports all state', async () => {
  const before = [window(1, 101, [
    tab(1, 'about:blank'),
    tab(2, 'https://app.example/login'),
    tab(3, 'https://dashboard.stripe.com/'),
    tab(4, 'https://us-east-1.signin.aws.amazon.com/'),
  ])];
  const after = [
    window(1, 101, [tab(1, 'about:blank')]),
    { ...window(2, 900, [before[0].tabs[1]]), domain: 'app.example' },
    { ...window(3, 901, [before[0].tabs[2]]), domain: 'dashboard.stripe.com' },
    { ...window(4, 902, [before[0].tabs[3]]), domain: 'us-east-1.signin.aws.amazon.com' },
  ];
  const { calls, dependencies } = harness(before, after);

  const result = await executeDomainGrouping(
    { currentWindowOnly: false, currentWindowId: null },
    dependencies
  );

  assert.deepEqual(result, {
    success: true,
    domainCount: 3,
    tabCount: 3,
    duplicateCount: 0,
  });
  assert.deepEqual(calls.filter(call => call[0] === 'create').map(call => call.slice(1, 3)), [
    [2, 'app.example'],
    [3, 'dashboard.stripe.com'],
    [4, 'us-east-1.signin.aws.amazon.com'],
  ]);
  assert.equal(calls.some(call => call[0] === 'move'), false);
  const saved = calls.find(call => call[0] === 'save');
  assert.equal(saved[1], 'groupingReport:fixed-report-id');
  assert.equal(saved[2].beforeWindows, before);
  assert.equal(saved[2].afterWindows, after);
  assert.deepEqual(calls.at(-1), ['open', 'fixed-report-id']);
});

test('groups file and Chrome internal tabs into one window per scheme', async () => {
  const before = [window(1, 101, [
    tab(1, 'file://localhost/tmp/one.html'),
    tab(2, 'file:///tmp/one.html'),
    tab(3, 'file:///tmp/two.html'),
    tab(4, 'chrome://extensions'),
    tab(5, 'chrome://extensions'),
    tab(6, 'chrome://settings/privacy'),
  ])];
  const { calls, dependencies } = harness(before, []);

  const result = await executeDomainGrouping(
    { currentWindowOnly: false, currentWindowId: null },
    dependencies
  );

  assert.equal(result.domainCount, 2);
  assert.equal(result.duplicateCount, 2);
  assert.deepEqual(calls[1], ['remove', [2, 5]]);
  assert.deepEqual(calls.filter(call => call[0] === 'create').map(call => call.slice(1, 3)), [
    [1, 'file://'],
    [4, 'chrome://'],
  ]);
  assert.deepEqual(calls.filter(call => call[0] === 'move'), [
    ['move', 3, 900],
    ['move', 6, 901],
  ]);
});

test('removes later exact duplicates before creating/moving domain windows', async () => {
  const before = [
    window(1, 101, [
      tab(1, 'https://github.com/octo-org/octo-repo/issues/1', 'kept'),
      tab(2, 'https://github.com/octo-org/octo-repo/pull/2'),
    ]),
    window(2, 202, [tab(3, 'https://github.com/octo-org/octo-repo/issues/1', 'removed')]),
  ];
  const { calls, dependencies } = harness(before, []);

  const result = await executeDomainGrouping(
    { currentWindowOnly: false, currentWindowId: null, byGithubRepo: true },
    dependencies
  );

  assert.equal(result.duplicateCount, 1);
  assert.deepEqual(calls[1], ['remove', [3]]);
  assert.deepEqual(calls[2].slice(0, 3), ['create', 1, 'github.com/octo-org/octo-repo']);
  assert.deepEqual(calls[3], ['move', 2, 900]);
  const report = calls.find(call => call[0] === 'save')[2];
  assert.equal(report.duplicates[0].kept.windowNumber, 1);
  assert.equal(report.duplicates[0].removed[0].windowNumber, 2);
});

test('current-window scope leaves other windows out of grouping and dedupe', async () => {
  const before = [
    window(1, 101, [tab(1, 'https://github.com/same')]),
    window(2, 202, [tab(2, 'https://github.com/same')]),
  ];
  const { calls, dependencies } = harness(before, []);

  const result = await executeDomainGrouping(
    { currentWindowOnly: true, currentWindowId: 202 },
    dependencies
  );

  assert.equal(result.domainCount, 1);
  assert.equal(result.duplicateCount, 0);
  assert.equal(calls.some(call => call[0] === 'remove'), false);
  assert.deepEqual(calls.find(call => call[0] === 'create').slice(1, 3), [2, 'github.com']);
  assert.equal(calls.find(call => call[0] === 'save')[2].scope, 'current-window');
});

test('incognito windows remain outside grouping and deduplication', async () => {
  const before = [
    window(1, 101, [tab(1, 'https://example.com/same')]),
    { ...window(2, 202, [tab(2, 'https://example.com/same')]), incognito: true },
  ];
  const { calls, dependencies } = harness(before, []);

  const result = await executeDomainGrouping(
    { currentWindowOnly: false, currentWindowId: null },
    dependencies
  );

  assert.equal(result.domainCount, 1);
  assert.equal(result.duplicateCount, 0);
  assert.equal(calls.some(call => call[0] === 'remove'), false);
  assert.deepEqual(calls.find(call => call[0] === 'create').slice(1, 3), [1, 'example.com']);
});

test('no eligible tabs causes no mutation, second snapshot, or report', async () => {
  const { calls, dependencies } = harness([
    window(1, 101, [tab(1, 'about:blank'), tab(2, 'ftp://example.com/file')]),
  ]);

  const result = await executeDomainGrouping(
    { currentWindowOnly: false, currentWindowId: null },
    dependencies
  );

  assert.deepEqual(result, {
    success: false,
    error: 'No groupable web, file, or Chrome tabs found.',
  });
  assert.deepEqual(calls, [['capture', null]]);
});

test('browser mutation failures propagate and prevent a misleading report', async () => {
  const { calls, dependencies } = harness([
    window(1, 101, [tab(1, 'https://example.com/')]),
  ]);
  dependencies.createGroupedWindow = async () => {
    calls.push(['create-failed']);
    throw new Error('window create failed');
  };

  await assert.rejects(
    executeDomainGrouping(
      { currentWindowOnly: false, currentWindowId: null },
      dependencies
    ),
    /window create failed/
  );
  assert.equal(calls.some(call => call[0] === 'save'), false);
  assert.equal(calls.some(call => call[0] === 'open'), false);
});

test('report-open failure discards temporary stored data and propagates', async () => {
  const { calls, dependencies } = harness([
    window(1, 101, [tab(1, 'https://example.com/')]),
  ], []);
  dependencies.openReport = async id => {
    calls.push(['open-failed', id]);
    throw new Error('report open failed');
  };

  await assert.rejects(
    executeDomainGrouping(
      { currentWindowOnly: false, currentWindowId: null },
      dependencies
    ),
    /report open failed/
  );
  assert.deepEqual(calls.at(-1), ['discard', 'groupingReport:fixed-report-id']);
});
