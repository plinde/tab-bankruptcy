const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isValidUrl } = require('./url-validation.js');

test('accepts bookmarkable web URLs and existing non-blocked schemes', () => {
  assert.equal(isValidUrl('https://example.com/path'), true);
  assert.equal(isValidUrl('http://example.com/'), true);
  assert.equal(isValidUrl('ftp://example.com/file'), true);
});

test('rejects missing and every internal/local blocked prefix', () => {
  for (const url of [
    undefined,
    null,
    '',
    'chrome://settings',
    'chrome-extension://extension-id/page.html',
    'edge://settings',
    'about:blank',
    'data:text/plain,hello',
    'file:///tmp/local.html',
  ]) {
    assert.equal(isValidUrl(url), false, String(url));
  }
});

test('prefix matching does not reject an internal-looking string in a web URL', () => {
  assert.equal(isValidUrl('https://example.com/?next=chrome://settings'), true);
});
