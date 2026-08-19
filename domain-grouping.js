// Plan HTTP(S) destination groups and exact-URL deduplication without chrome.*.
//
// `windows` is an ordered snapshot of { windowNumber, windowId, tabs }. The
// first occurrence of a normalized URL is kept; later occurrences are recorded
// for removal with their original window provenance. Every hostname is
// actionable, including a hostname represented by one unique tab. GitHub.com
// tabs can optionally be specialized into owner/repository groups.
function planDomainGrouping(windows, options = {}) {
  const groupsByDomain = new Map();
  const firstByUrl = new Map();
  const duplicatesByUrl = new Map();

  for (const [index, window] of (windows || []).entries()) {
    if (!window) continue;
    const windowNumber = window.windowNumber || index + 1;

    for (const tab of window.tabs || []) {
      if (!tab || typeof tab.url !== 'string') continue;

      let parsed;
      try {
        parsed = new URL(tab.url);
      } catch (error) {
        continue;
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;

      const domain = groupingDomain(parsed, options.byGithubRepo === true);
      if (!domain) continue;

      const normalizedUrl = parsed.href;
      const occurrence = {
        windowNumber,
        windowId: window.windowId,
        tab: {
          id: tab.id,
          title: tab.title || tab.url,
          url: tab.url
        }
      };

      if (firstByUrl.has(normalizedUrl)) {
        if (!duplicatesByUrl.has(normalizedUrl)) {
          duplicatesByUrl.set(normalizedUrl, {
            url: normalizedUrl,
            kept: firstByUrl.get(normalizedUrl),
            removed: []
          });
        }
        duplicatesByUrl.get(normalizedUrl).removed.push(occurrence);
        continue;
      }

      firstByUrl.set(normalizedUrl, occurrence);
      if (!groupsByDomain.has(domain)) {
        groupsByDomain.set(domain, []);
      }
      groupsByDomain.get(domain).push(occurrence.tab);
    }
  }

  return {
    groups: Array.from(groupsByDomain, ([domain, tabs]) => ({ domain, tabs })),
    duplicates: Array.from(duplicatesByUrl.values())
  };
}

function groupingDomain(parsed, byGithubRepo = false) {
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== 'github.com' || !byGithubRepo) return hostname;

  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  if (pathSegments.length < 2) return hostname;

  const [owner, repository] = pathSegments;
  return `${hostname}/${owner.toLowerCase()}/${repository.toLowerCase()}`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { planDomainGrouping, groupingDomain };
}
