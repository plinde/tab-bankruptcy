// Plan repeated-hostname tab groups without depending on chrome.* APIs.
//
// Input order is significant: Chrome window order, then tab order. The output
// keeps the first-seen hostname order and each group's original tab order.
// Only HTTP(S) hostnames with at least two tabs are actionable; singletons and
// internal or malformed URLs remain untouched.
function planDomainGroups(windowTabLists) {
  const groupsByDomain = new Map();

  for (const tabs of windowTabLists || []) {
    for (const tab of tabs || []) {
      if (!tab || typeof tab.url !== 'string') continue;

      let parsed;
      try {
        parsed = new URL(tab.url);
      } catch (error) {
        continue;
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;

      const domain = parsed.hostname.toLowerCase();
      if (!domain) continue;

      if (!groupsByDomain.has(domain)) {
        groupsByDomain.set(domain, []);
      }
      groupsByDomain.get(domain).push(tab);
    }
  }

  return Array.from(groupsByDomain, ([domain, tabs]) => ({ domain, tabs }))
    .filter(group => group.tabs.length >= 2);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { planDomainGroups };
}
