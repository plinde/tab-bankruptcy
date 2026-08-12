const { test } = require('node:test');
const assert = require('node:assert/strict');
const { focusBrowserWindow } = require('./window-focus.js');

test('focuses the requested browser window', async () => {
  const calls = [];
  const result = await focusBrowserWindow(42, async (windowId, updateInfo) => {
    calls.push([windowId, updateInfo]);
  });

  assert.deepEqual(calls, [[42, { focused: true }]]);
  assert.deepEqual(result, { success: true, windowId: 42 });
});

test('rejects invalid IDs before calling Chrome', async () => {
  let called = false;
  for (const windowId of [undefined, null, '42', -1, 1.5]) {
    await assert.rejects(
      focusBrowserWindow(windowId, async () => { called = true; }),
      /Invalid browser window identifier/
    );
  }
  assert.equal(called, false);
});

test('propagates a closed-window API error', async () => {
  await assert.rejects(
    focusBrowserWindow(42, async () => {
      throw new Error('No window with id: 42.');
    }),
    /No window with id: 42/
  );
});
