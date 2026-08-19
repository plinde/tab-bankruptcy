const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  planSingletonCombination,
  executeSingletonCombination,
  planWindowSort,
  executeWindowSort,
} = require('./tab-organization.js');

const tab = (id, url, title = url, pinned = false, groupId = -1) => ({
  id,
  url,
  title,
  pinned,
  groupId,
});
const window = (windowId, tabs) => ({ windowId, tabs });

test('combines all singleton windows into the first singleton window', () => {
  const plan = planSingletonCombination([
    window(101, [tab(1, 'https://one.example/')]),
    window(202, [tab(2, 'https://two.example/')]),
    window(303, [tab(3, 'https://three.example/'), tab(4, 'https://three.example/other')]),
    window(404, [tab(5, 'file:///tmp/local')]),
  ]);

  assert.deepEqual(plan, {
    targetWindowId: 101,
    moves: [
      { tabId: 2, sourceWindowId: 202 },
      { tabId: 5, sourceWindowId: 404 },
    ],
  });
});

test('combines every singleton window into an existing general GitHub window', () => {
  const plan = planSingletonCombination([
    window(101, [
      tab(1, 'https://github.com/'),
      tab(5, 'https://github.com/notifications'),
    ]),
    window(202, [tab(2, 'https://github.com/octo-org/octo-repo/issues/1')]),
    window(303, [tab(3, 'https://example.com/')]),
    window(404, [tab(4, 'file:///tmp/local')]),
  ], 'github');

  assert.deepEqual(plan, {
    targetWindowId: 101,
    moves: [
      { tabId: 2, sourceWindowId: 202 },
      { tabId: 3, sourceWindowId: 303 },
      { tabId: 4, sourceWindowId: 404 },
    ],
  });
});

test('plans a dedicated catch-all when no GitHub target exists', () => {
  const plan = planSingletonCombination([
    window(202, [tab(2, 'https://example.com/one')]),
    window(303, [tab(3, 'https://example.net/two')]),
  ], 'github');

  assert.deepEqual(plan, {
    targetWindowId: null,
    createTargetTabId: 2,
    moves: [{ tabId: 3, sourceWindowId: 303 }],
  });
});

test('moves a non-GitHub singleton into an existing repository-specific GitHub window', () => {
  const plan = planSingletonCombination([
    window(101, [
      tab(1, 'https://github.com/octo-org/octo-repo/issues/1'),
      tab(2, 'https://github.com/octo-org/octo-repo/pull/2'),
    ]),
    window(202, [tab(3, 'https://example.com/')]),
  ], 'github');

  assert.deepEqual(plan, {
    targetWindowId: 101,
    moves: [{ tabId: 3, sourceWindowId: 202 }],
  });
});

test('reuses a GitHub target after it already contains non-GitHub tabs', () => {
  const plan = planSingletonCombination([
    window(101, [
      tab(1, 'https://github.com/octo-org/octo-repo/issues/1'),
      tab(2, 'https://example.net/already-combined'),
    ]),
    window(202, [tab(3, 'https://example.com/new-singleton')]),
  ], 'github', 101);

  assert.deepEqual(plan, {
    targetWindowId: 101,
    moves: [{ tabId: 3, sourceWindowId: 202 }],
  });
});

test('ignores mixed windows that were not selected as the GitHub target', () => {
  const plan = planSingletonCombination([
    window(101, [
      tab(1, 'https://github.com/octo-org/octo-repo/issues/1'),
      tab(2, 'https://example.net/unrelated'),
    ]),
    window(102, [
      tab(3, 'https://github.com/monalisa/octo-repo/issues/1'),
      tab(4, 'https://github.com/monalisa/octo-repo/pull/2'),
    ]),
    window(202, [tab(5, 'https://example.com/singleton')]),
  ], 'github');

  assert.deepEqual(plan, {
    targetWindowId: 102,
    moves: [{ tabId: 5, sourceWindowId: 202 }],
  });
});

test('prefers the largest dedicated GitHub window deterministically', () => {
  const plan = planSingletonCombination([
    window(101, [tab(1, 'https://github.com/octo-org/octo-repo')]),
    window(102, [
      tab(2, 'https://github.com/monalisa/octo-repo/issues/1'),
      tab(3, 'https://github.com/monalisa/octo-repo/pull/2'),
    ]),
    window(202, [tab(4, 'https://example.com/singleton')]),
  ], 'github');

  assert.deepEqual(plan, {
    targetWindowId: 102,
    moves: [
      { tabId: 1, sourceWindowId: 101 },
      { tabId: 4, sourceWindowId: 202 },
    ],
  });
});

test('does not select an unremembered mixed window as the target', () => {
  const plan = planSingletonCombination([
    window(101, [
      tab(1, 'https://github.com/octo-org/octo-repo/issues/1'),
      tab(2, 'https://example.com/one'),
      tab(3, 'https://example.com/two'),
    ]),
    window(102, [
      tab(4, 'https://github.com/monalisa/octo-repo/issues/1'),
      tab(5, 'https://github.com/monalisa/octo-repo/pull/2'),
      tab(6, 'https://example.net/mixed'),
    ]),
    window(202, [tab(7, 'https://example.org/singleton')]),
  ], 'github');

  assert.deepEqual(plan, {
    targetWindowId: null,
    createTargetTabId: 7,
    moves: [],
  });
});

test('all mode is a no-op with one singleton and GitHub mode is a no-op with none', () => {
  assert.deepEqual(planSingletonCombination([
    window(101, [tab(1, 'https://example.com/')]),
  ]), { targetWindowId: null, moves: [] });
  assert.deepEqual(planSingletonCombination([], 'github'), {
    targetWindowId: null,
    moves: [],
  });
});

test('executes singleton moves into the planned target window', async () => {
  const calls = [];
  const result = await executeSingletonCombination('all', {
    async captureNormalWindows() {
      return [
        window(101, [tab(1, 'https://one.example/')]),
        window(202, [tab(2, 'https://two.example/')]),
        window(303, [tab(3, 'https://three.example/')]),
      ];
    },
    async moveTab(tabId, windowId) {
      calls.push([tabId, windowId]);
    },
  });

  assert.deepEqual(calls, [[2, 101], [3, 101]]);
  assert.deepEqual(result, {
    success: true,
    tabCount: 2,
    windowCount: 2,
    targetWindowId: 101,
  });
});

test('singleton combination reports an unchanged run as success', async () => {
  const result = await executeSingletonCombination('all', {
    async captureNormalWindows() {
      return [window(101, [tab(1, 'https://one.example/')])];
    },
    async moveTab() {
      assert.fail('no tab should move');
    },
  });

  assert.deepEqual(result, {
    success: true,
    tabCount: 0,
    windowCount: 0,
    targetWindowId: null,
  });
});

test('GitHub combination persists the selected target window', async () => {
  const savedTargets = [];
  const result = await executeSingletonCombination('github', {
    async captureNormalWindows() {
      return [
        window(101, [
          tab(1, 'https://github.com/octo-org/octo-repo/issues/1'),
          tab(2, 'https://github.com/octo-org/octo-repo/pull/2'),
        ]),
        window(202, [tab(3, 'https://example.com/singleton')]),
      ];
    },
    async getPreferredTargetWindowId() {
      return null;
    },
    async moveTab() {},
    async savePreferredTargetWindowId(windowId) {
      savedTargets.push(windowId);
    },
  });

  assert.equal(result.targetWindowId, 101);
  assert.deepEqual(savedTargets, [101]);
});

test('GitHub combination moves a lone singleton into a new dedicated catch-all', async () => {
  const calls = [];
  const result = await executeSingletonCombination('github', {
    async captureNormalWindows() {
      return [window(202, [tab(3, 'https://example.com/singleton')])];
    },
    async getPreferredTargetWindowId() {
      return null;
    },
    async createTargetWindow(tabId) {
      calls.push(['create', tabId]);
      return 900;
    },
    async moveTab(tabId, windowId) {
      calls.push(['move', tabId, windowId]);
    },
    async savePreferredTargetWindowId(windowId) {
      calls.push(['save', windowId]);
    },
  });

  assert.deepEqual(calls, [['create', 3], ['save', 900]]);
  assert.deepEqual(result, {
    success: true,
    tabCount: 1,
    windowCount: 1,
    targetWindowId: 900,
  });
});

test('sorts by title within pinned and unpinned sections', () => {
  const plans = planWindowSort([
    window(101, [
      tab(1, 'https://z.example/', 'Zulu', true),
      tab(2, 'https://a.example/', 'Alpha', true),
      tab(3, 'https://b.example/', 'Beta'),
      tab(4, 'https://a.example/', 'Alpha'),
    ]),
  ], 'title');

  assert.deepEqual(plans, [{
    windowId: 101,
    tabIds: [2, 1, 4, 3],
    changed: true,
  }]);
});

test('sorts by URL and preserves original order for equal values', () => {
  const plans = planWindowSort([
    window(101, [
      tab(1, 'https://example.com/b', 'First B'),
      tab(2, 'https://example.com/a', 'A'),
      tab(3, 'https://example.com/b', 'Second B'),
    ]),
  ], 'url');

  assert.deepEqual(plans[0].tabIds, [2, 1, 3]);
});

test('sorts by URL and uses title to break equal-URL ties', () => {
  const plans = planWindowSort([
    window(101, [
      tab(1, 'https://example.com/b', 'Beta'),
      tab(2, 'https://example.com/a', 'Zulu'),
      tab(3, 'https://example.com/a', 'Alpha'),
    ]),
  ], 'url-title');

  assert.deepEqual(plans[0].tabIds, [3, 2, 1]);
});

test('sorts within tab groups without moving tabs across group boundaries', () => {
  const plans = planWindowSort([
    window(101, [
      tab(1, 'https://example.com/z', 'Zulu ungrouped'),
      tab(2, 'https://example.com/d', 'Delta grouped', false, 7),
      tab(3, 'https://example.com/c', 'Charlie grouped', false, 7),
      tab(4, 'https://example.com/b', 'Beta ungrouped'),
      tab(5, 'https://example.com/a', 'Alpha ungrouped'),
    ]),
  ], 'title');

  assert.deepEqual(plans[0].tabIds, [1, 3, 2, 5, 4]);
});

test('sort execution only moves tabs in changed, scoped windows', async () => {
  const calls = [];
  const result = await executeWindowSort(
    { currentWindowOnly: true, currentWindowId: 202, sortBy: 'title' },
    {
      async captureNormalWindows() {
        return [
          window(101, [tab(1, 'https://example.com/b', 'B'), tab(2, 'https://example.com/a', 'A')]),
          window(202, [tab(3, 'https://example.com/b', 'B'), tab(4, 'https://example.com/a', 'A')]),
        ];
      },
      async moveTab(tabId, windowId, index) {
        calls.push([tabId, windowId, index]);
      },
    }
  );

  assert.deepEqual(calls, [[4, 202, 0], [3, 202, 1]]);
  assert.deepEqual(result, { success: true, windowCount: 1, tabCount: 2 });
});

test('already sorted windows require no browser moves', async () => {
  let moved = false;
  const result = await executeWindowSort(
    { currentWindowOnly: false, currentWindowId: null, sortBy: 'title' },
    {
      async captureNormalWindows() {
        return [window(101, [
          tab(1, 'https://example.com/a', 'A'),
          tab(2, 'https://example.com/b', 'B'),
        ])];
      },
      async moveTab() {
        moved = true;
      },
    }
  );

  assert.equal(moved, false);
  assert.deepEqual(result, { success: true, windowCount: 0, tabCount: 0 });
});
