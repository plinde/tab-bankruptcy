// Decide which windows to save and how to number them.
//
// Pure function (no chrome.* calls) so it can be unit-tested in Node without a
// browser. Shared with the service worker via importScripts and tested in
// bankruptcy-plan.test.js.
//
// Input: `windowTabLists` — an array (one entry per open window, in the order
// chrome.windows.getAll returns them) where each entry is that window's array
// of tab objects. `isValidUrl` decides which tabs are bookmarkable.
//
// Output: an ordered array of { windowNumber, tabs } for ONLY the windows that
// have at least one bookmarkable tab. Empty windows are dropped so no empty
// "Window N" folder is ever created, and the survivors are renumbered
// sequentially from 1 (no gaps).
function planBankruptcyWindows(windowTabLists, isValidUrl) {
  const planned = [];
  for (const tabs of windowTabLists || []) {
    const validTabs = (tabs || []).filter(tab => tab && isValidUrl(tab.url));
    if (validTabs.length > 0) {
      planned.push(validTabs);
    }
  }
  return planned.map((tabs, i) => ({ windowNumber: i + 1, tabs }));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { planBankruptcyWindows };
}
