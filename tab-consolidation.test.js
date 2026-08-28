const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  planTabConsolidation,
  executeTabConsolidation,
  normalizeUrl,
} = require('./tab-consolidation.js');

const tab = (id, url, title = url) => ({ id, url, title });
const window = (windowId, tabs, incognito = false) => ({ windowId, incognito, tabs });

test('keeps every unique tab in discovery order and drops later exact duplicates', () => {
  const plan = planTabConsolidation([
    window(101, [
      tab(1, 'https://example.com/'),
      tab(2, 'https://example.com/docs'),
    ]),
    window(202, [
      tab(3, 'https://example.com/'),
      tab(4, 'https://example.net/'),
    ]),
  ]);

  assert.deepEqual(plan.keptTabs.map(t => t.id), [1, 2, 4]);
  assert.deepEqual(plan.duplicateTabIds, [3]);
  assert.equal(plan.sourceWindowCount, 2);
  assert.equal(plan.needsWork, true);
});

test('normalizes exact-URL equality (trailing dot host, default port) but keeps query/fragment differences', () => {
  const plan = planTabConsolidation([
    window(101, [
      tab(1, 'https://example.com/'),
      tab(2, 'https://example.com:443/'),
      tab(3, 'https://example.com/?a=1'),
      tab(4, 'https://example.com/#top'),
    ]),
  ]);

  // tab 2 normalizes to the same href as tab 1; the query/fragment variants stay distinct.
  assert.deepEqual(plan.keptTabs.map(t => t.id), [1, 3, 4]);
  assert.deepEqual(plan.duplicateTabIds, [2]);
});

test('always keeps blank or unparseable URLs and never deduplicates them', () => {
  const plan = planTabConsolidation([
    window(101, [
      tab(1, ''),
      tab(2, 'not a url'),
      tab(3, 'not a url'),
    ]),
  ]);

  assert.deepEqual(plan.keptTabs.map(t => t.id), [1, 2, 3]);
  assert.deepEqual(plan.duplicateTabIds, []);
});

test('single window with no duplicates needs no work', () => {
  const plan = planTabConsolidation([
    window(101, [tab(1, 'https://one.example/'), tab(2, 'https://two.example/')]),
  ]);

  assert.equal(plan.needsWork, false);
  assert.equal(plan.sourceWindowCount, 1);
});

test('single window with duplicates still needs work', () => {
  const plan = planTabConsolidation([
    window(101, [tab(1, 'https://one.example/'), tab(2, 'https://one.example/')]),
  ]);

  assert.equal(plan.needsWork, true);
  assert.deepEqual(plan.duplicateTabIds, [2]);
});

test('normalizeUrl returns null for blank and malformed input', () => {
  assert.equal(normalizeUrl(''), null);
  assert.equal(normalizeUrl('not a url'), null);
  assert.equal(normalizeUrl(undefined), null);
  assert.equal(normalizeUrl('https://example.com/'), 'https://example.com/');
});

test('executes: removes duplicates, opens a new target window, moves the rest', async () => {
  const removed = [];
  const moves = [];
  let createdFrom = null;

  const result = await executeTabConsolidation({
    async captureNormalWindows() {
      return [
        window(101, [tab(1, 'https://a.example/'), tab(2, 'https://b.example/')]),
        window(202, [tab(3, 'https://a.example/'), tab(4, 'https://c.example/')]),
      ];
    },
    async removeTabs(ids) {
      removed.push(...ids);
    },
    async createTargetWindow(tabId) {
      createdFrom = tabId;
      return 999;
    },
    async moveTab(tabId, windowId) {
      moves.push([tabId, windowId]);
    },
  });

  assert.deepEqual(removed, [3]);
  assert.equal(createdFrom, 1);
  assert.deepEqual(moves, [[2, 999], [4, 999]]);
  assert.deepEqual(result, {
    success: true,
    tabCount: 3,
    windowCount: 2,
    duplicateCount: 1,
    consolidated: true,
    targetWindowId: 999,
  });
});

test('executes: leaves incognito windows untouched', async () => {
  const moves = [];
  let created = false;

  const result = await executeTabConsolidation({
    async captureNormalWindows() {
      return [
        window(101, [tab(1, 'https://a.example/')]),
        window(202, [tab(2, 'https://b.example/')], true),
      ];
    },
    async removeTabs() {
      assert.fail('no duplicates to remove');
    },
    async createTargetWindow() {
      created = true;
      return 999;
    },
    async moveTab(tabId, windowId) {
      moves.push([tabId, windowId]);
    },
  });

  // Only one non-incognito window remains, so consolidation is a no-op.
  assert.equal(created, false);
  assert.deepEqual(moves, []);
  assert.deepEqual(result, {
    success: true,
    tabCount: 0,
    windowCount: 0,
    duplicateCount: 0,
    consolidated: false,
    targetWindowId: null,
  });
});

test('executes: no-op when everything is already one window without duplicates', async () => {
  const result = await executeTabConsolidation({
    async captureNormalWindows() {
      return [window(101, [tab(1, 'https://a.example/'), tab(2, 'https://b.example/')])];
    },
    async removeTabs() {
      assert.fail('nothing to remove');
    },
    async createTargetWindow() {
      assert.fail('no window should be created');
    },
    async moveTab() {
      assert.fail('no tab should move');
    },
  });

  assert.equal(result.consolidated, false);
  assert.equal(result.tabCount, 0);
});

test('executes: skips duplicate removal when there are none', async () => {
  const moves = [];
  const result = await executeTabConsolidation({
    async captureNormalWindows() {
      return [
        window(101, [tab(1, 'https://a.example/')]),
        window(202, [tab(2, 'https://b.example/')]),
      ];
    },
    async removeTabs() {
      assert.fail('no duplicates to remove');
    },
    async createTargetWindow() {
      return 999;
    },
    async moveTab(tabId, windowId) {
      moves.push([tabId, windowId]);
    },
  });

  assert.deepEqual(moves, [[2, 999]]);
  assert.deepEqual(result, {
    success: true,
    tabCount: 2,
    windowCount: 2,
    duplicateCount: 0,
    consolidated: true,
    targetWindowId: 999,
  });
});
