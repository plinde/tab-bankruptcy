const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const manifest = require('./manifest.json');

test('manifest declares every permission required by bankruptcy and grouping reports', () => {
  assert.deepEqual(new Set(manifest.permissions), new Set([
    'bookmarks',
    'tabs',
    'identity',
    'storage',
  ]));
});

test('temporary report surface and service-worker helpers are packaged source files', () => {
  for (const path of [
    'report.html',
    'report.css',
    'report.js',
    'grouping-operation.js',
    'grouping-report.js',
    'domain-grouping.js',
    'url-validation.js',
  ]) {
    assert.equal(fs.existsSync(path), true, path);
  }

  const reportHtml = fs.readFileSync('report.html', 'utf8');
  assert.match(reportHtml, /href="report\.css"/);
  assert.match(reportHtml, /src="report\.js"/);
});
