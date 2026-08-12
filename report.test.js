const { test } = require('node:test');
const assert = require('node:assert/strict');

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.textContent = '';
    this.className = '';
    this.hidden = true;
  }

  append(...children) {
    this.children.push(...children);
  }
}

function installDocument() {
  const ids = new Map([
    'reportMeta',
    'reportError',
    'reportContent',
    'summary',
    'duplicates',
    'beforeWindows',
    'afterWindows',
  ].map(id => [id, new FakeElement()]));

  global.document = {
    addEventListener() {},
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    getElementById(id) {
      return ids.get(id);
    },
  };
  return ids;
}

test('renders report content as text and exposes before/after/duplicate provenance', () => {
  const ids = installDocument();
  const { renderReport } = require('./report.js');
  const hostileTitle = '<img src=x onerror=alert(1)>';
  const occurrence = {
    windowNumber: 1,
    tab: { title: hostileTitle, url: 'https://example.com/' },
  };

  renderReport({
    createdAt: '2026-08-11T12:00:00.000Z',
    scope: 'all-windows',
    summary: { domainCount: 1, groupedTabCount: 1, duplicateTabCount: 1 },
    duplicates: [{
      url: 'https://example.com/',
      kept: occurrence,
      removed: [{ ...occurrence, windowNumber: 2 }],
    }],
    beforeWindows: [{
      windowNumber: 1,
      domain: null,
      tabs: [occurrence.tab, { title: 'Local', url: 'file:///tmp/local.html' }],
    }],
    afterWindows: [{ windowNumber: 1, domain: 'example.com', tabs: [occurrence.tab] }],
  });

  assert.equal(ids.get('reportContent').hidden, false);
  assert.equal(ids.get('summary').children.length, 6);
  assert.equal(ids.get('duplicates').children.length, 1);
  assert.equal(ids.get('beforeWindows').children.length, 1);
  assert.equal(ids.get('afterWindows').children.length, 1);

  const beforeTitle = ids.get('beforeWindows').children[0].children[1].children[0].children[0];
  assert.equal(beforeTitle.textContent, hostileTitle);
  assert.equal(beforeTitle.children.length, 0);
  const localUrl = ids.get('beforeWindows').children[0].children[1].children[1].children[1];
  assert.equal(localUrl.tagName, 'span');
  assert.equal(localUrl.textContent, 'file:///tmp/local.html');
  assert.match(ids.get('afterWindows').children[0].children[0].textContent, /Domain: example\.com/);

  delete global.document;
  delete require.cache[require.resolve('./report.js')];
});
