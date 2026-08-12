// Bookmark eligibility shared by the service worker and Node tests.
function isValidUrl(url) {
  if (!url) return false;

  const invalidPrefixes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'data:',
    'file://'
  ];

  return !invalidPrefixes.some(prefix => url.startsWith(prefix));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isValidUrl };
}
