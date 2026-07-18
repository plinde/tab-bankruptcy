const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveBookmarksBar } = require('./bookmarks-bar.js');

// Wrap a set of root-level permanent folders in the shape chrome.bookmarks
// .getTree() returns: a single-element array whose [0] is the root node.
function tree(rootChildren) {
  return [{ id: '0', title: '', children: rootChildren }];
}

const otherBookmarks = { id: '2', title: 'Other bookmarks', folderType: 'other', children: [] };

test('local-only profile: single id "1" bar, no folderType', () => {
  const bar = { id: '1', title: 'Bookmarks bar', children: [] };
  const t = tree([bar, otherBookmarks]);
  assert.equal(resolveBookmarksBar(t), bar);
});

test('account bookmarks only: folderType bar whose id is not "1"', () => {
  // Reproduces the reported bug — no node has id '1'.
  const accountBar = {
    id: 'ACCOUNT_BAR', title: 'Bookmarks bar', folderType: 'bookmarks-bar', syncing: true, children: [],
  };
  const t = tree([accountBar, { id: 'ACCOUNT_OTHER', folderType: 'other', children: [] }]);
  assert.equal(resolveBookmarksBar(t), accountBar);
});

test('both bars present: prefers the account/synced bar', () => {
  const localBar = {
    id: '1', title: 'Bookmarks bar', folderType: 'bookmarks-bar', syncing: false, children: [],
  };
  const accountBar = {
    id: 'ACCOUNT_BAR', title: 'Bookmarks bar', folderType: 'bookmarks-bar', syncing: true, children: [],
  };
  // Local listed first — precedence must not depend on document order.
  const t = tree([localBar, accountBar, otherBookmarks]);
  assert.equal(resolveBookmarksBar(t), accountBar);
});

test('folderType present but no syncing flag: returns first in document order', () => {
  const first = { id: 'A', title: 'Bookmarks bar', folderType: 'bookmarks-bar', children: [] };
  const second = { id: 'B', title: 'Bookmarks bar', folderType: 'bookmarks-bar', children: [] };
  const t = tree([first, second]);
  assert.equal(resolveBookmarksBar(t), first);
});

test('no bar resolvable: no folderType and no id "1" returns null', () => {
  const t = tree([{ id: '7', title: 'Mobile bookmarks', children: [] }]);
  assert.equal(resolveBookmarksBar(t), null);
});

test('degenerate inputs return null', () => {
  assert.equal(resolveBookmarksBar([]), null);
  assert.equal(resolveBookmarksBar(null), null);
  assert.equal(resolveBookmarksBar([{ id: '0' }]), null); // root without children
});

test('never treats a bookmark (has url) as a bar', () => {
  const linkNamedLikeBar = { id: '1', title: 'Bookmarks bar', url: 'https://example.com' };
  const realBar = { id: 'ACCOUNT_BAR', folderType: 'bookmarks-bar', syncing: true, children: [] };
  assert.equal(resolveBookmarksBar(tree([linkNamedLikeBar, realBar])), realBar);
});
