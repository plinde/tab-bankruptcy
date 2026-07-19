// Resolve the writable Bookmarks Bar from a chrome.bookmarks tree.
//
// This is a pure function (no chrome.* calls) so it can be unit-tested in
// Node without a browser. It is shared between the service worker
// (loaded via importScripts) and the test suite (loaded via require).
//
// Resolution strategy, in order of preference:
//   1. folderType === 'bookmarks-bar' — the id-independent signal Chrome 134+
//      exposes. More than one node can match when a signed-in profile has both
//      an account (synced) bar and a local (device) bar.
//        Precedence: prefer the account/synced bar (syncing === true), then the
//        local bar, then document order when no `syncing` flag is present.
//   2. Legacy fallback for older Chrome that does not populate folderType: the
//      permanent Bookmarks Bar node has id '1'.
// Returns the chosen BookmarkTreeNode, or null when no bar can be resolved.
function resolveBookmarksBar(tree) {
  if (!Array.isArray(tree) || tree.length === 0 || !tree[0]) return null;
  const roots = Array.isArray(tree[0].children) ? tree[0].children : [];

  // Strategy 1: folderType (Chrome 134+), id-independent.
  const byFolderType = roots.filter(
    node => node.folderType === 'bookmarks-bar' && !node.url
  );
  if (byFolderType.length > 0) {
    const synced = byFolderType.find(node => node.syncing === true);
    return synced || byFolderType[0];
  }

  // Strategy 2: legacy fallback — Bookmarks Bar has permanent id '1'.
  const byId = roots.find(node => node.id === '1' && !node.url);
  return byId || null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { resolveBookmarksBar };
}
