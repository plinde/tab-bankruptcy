const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planBankruptcyWindows } = require('./bankruptcy-plan.js');

// Test stub mirroring background.js isValidUrl closely enough for planning.
const isValidUrl = (url) => !!url && !url.startsWith('chrome://') && !url.startsWith('file://');

const tab = (url) => ({ url, title: url });

test('all windows valid: kept in order, numbered 1..n, tab order preserved', () => {
  const plan = planBankruptcyWindows(
    [
      [tab('https://a.com'), tab('https://b.com')],
      [tab('https://c.com')],
      [tab('https://d.com'), tab('https://e.com')],
    ],
    isValidUrl
  );
  assert.deepEqual(plan.map(w => w.windowNumber), [1, 2, 3]);
  assert.deepEqual(plan[0].tabs.map(t => t.url), ['https://a.com', 'https://b.com']);
  assert.equal(plan[2].tabs.length, 2);
});

test('middle window all-invalid: dropped, survivors renumbered with no gap', () => {
  const plan = planBankruptcyWindows(
    [
      [tab('https://keep1.com')],
      [tab('chrome://settings'), tab('chrome://extensions')],
      [tab('https://keep3.com')],
    ],
    isValidUrl
  );
  assert.equal(plan.length, 2);
  assert.deepEqual(plan.map(w => w.windowNumber), [1, 2]);
  assert.equal(plan[0].tabs[0].url, 'https://keep1.com'); // original first window
  assert.equal(plan[1].tabs[0].url, 'https://keep3.com'); // original third window
});

test('leading window all-invalid: single Window 1 holds the second window tabs', () => {
  const plan = planBankruptcyWindows(
    [
      [tab('chrome://newtab')],
      [tab('https://real.com')],
    ],
    isValidUrl
  );
  assert.equal(plan.length, 1);
  assert.equal(plan[0].windowNumber, 1);
  assert.equal(plan[0].tabs[0].url, 'https://real.com');
});

test('window with zero tabs is dropped', () => {
  const plan = planBankruptcyWindows(
    [[], [tab('https://x.com')], []],
    isValidUrl
  );
  assert.equal(plan.length, 1);
  assert.equal(plan[0].windowNumber, 1);
});

test('all windows invalid or empty: returns empty array (drives all-empty case)', () => {
  const plan = planBankruptcyWindows(
    [[tab('chrome://a')], [], [tab('file:///tmp/x')]],
    isValidUrl
  );
  assert.deepEqual(plan, []);
});

test('only valid tabs within a window are retained', () => {
  const plan = planBankruptcyWindows(
    [[tab('chrome://gpu'), tab('https://good.com'), tab('file:///y')]],
    isValidUrl
  );
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0].tabs.map(t => t.url), ['https://good.com']);
});

test('derived counts match the plan', () => {
  const plan = planBankruptcyWindows(
    [[tab('https://a.com'), tab('https://b.com')], [tab('https://c.com')]],
    isValidUrl
  );
  const savedWindowCount = plan.length;
  const savedTabCount = plan.reduce((n, w) => n + w.tabs.length, 0);
  assert.equal(savedWindowCount, 2);
  assert.equal(savedTabCount, 3);
});

test('degenerate inputs are safe', () => {
  assert.deepEqual(planBankruptcyWindows(undefined, isValidUrl), []);
  assert.deepEqual(planBankruptcyWindows([null, undefined], isValidUrl), []);
});
